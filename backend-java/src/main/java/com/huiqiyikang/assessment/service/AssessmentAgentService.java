package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.entity.AssessmentAnswer;
import com.huiqiyikang.assessment.entity.AssessmentDimensionScore;
import com.huiqiyikang.assessment.entity.AssessmentPointScore;
import com.huiqiyikang.assessment.entity.AssessmentMessage;
import com.huiqiyikang.assessment.entity.AssessmentQuestion;
import com.huiqiyikang.assessment.mapper.AssessmentDimensionScoreRepository;
import com.huiqiyikang.assessment.mapper.AssessmentPointScoreRepository;
import com.huiqiyikang.assessment.mapper.AssessmentQuestionRepository;
import com.huiqiyikang.assessment.mapper.AssessmentRepository;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class AssessmentAgentService {
    private final AssessmentService assessments;
    private final EngineService engine;
    private final LlmClient llm;
    private final AssessmentQuestionRepository assessmentQuestions;
    private final AssessmentDimensionScoreRepository dimensionScores;
    private final AssessmentPointScoreRepository pointScores;
    private final ReportSnapshotService snapshots;
    private final ObjectMapper mapper;

    public AssessmentAgentService(AssessmentService assessments, EngineService engine, LlmClient llm,
                                  AssessmentQuestionRepository assessmentQuestions,
                                  AssessmentDimensionScoreRepository dimensionScores,
                                  AssessmentPointScoreRepository pointScores,
                                  ReportSnapshotService snapshots,
                                  ObjectMapper mapper) {
        this.assessments = assessments;
        this.engine = engine;
        this.llm = llm;
        this.assessmentQuestions = assessmentQuestions;
        this.dimensionScores = dimensionScores;
        this.pointScores = pointScores;
        this.snapshots = snapshots;
        this.mapper = mapper;
    }

    public Map<String, Object> conversation(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        List<AssessmentQuestion> questions = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<AssessmentMessage> messages = assessments.findByAssessmentIdOrderByCreatedAt(assessmentId);
        AssessmentQuestion current = questions.stream()
                .filter(q -> !"answered".equals(q.getStatus()))
                .reduce((first, second) -> second)
                .orElse(null);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessment", assessmentView(assessment));
        data.put("messages", conversationMessages(messages, questions));
        data.put("question", current == null ? null : questionEvent(current));
        // v9 前端左侧题目列表需要整场题目（含状态）；旧前端只读 question，不影响
        data.put("questions", questions.stream().map(this::questionListItem).toList());
        // v9 前端左侧「Agent 追问」卡片；旧前端不读该字段
        data.put("followUps", current == null ? List.of() : followUps(current));
        data.put("currentQuestion", current == null ? null : questionEvent(current));
        return data;
    }

    /** v9 左侧题目列表项：pP 取 id、mP 取 type、hP 取 content，done 标记看 answered/completed。 */
    private Map<String, Object> questionListItem(AssessmentQuestion q) {
        Map<String, Object> data = questionEvent(q);
        data.put("sequenceNo", q.getSequenceNo());
        data.put("status", q.getStatus());
        data.put("answered", "answered".equals(q.getStatus()));
        data.put("completed", q.isFinished());
        return data;
    }

    /** v9 左侧「Agent 追问」：当前题目的 AI 消息（第一条是题干，跳过）。 */
    private List<Map<String, Object>> followUps(AssessmentQuestion question) {
        List<Map<String, Object>> out = new ArrayList<>();
        List<AssessmentMessage> questionMessages = assessments.findByAssessmentQuestionIdOrderBySequenceNo(question.getId());
        List<LlmClient.FollowupTurn> turns = followupTurns(questionMessages);
        int turnIndex = 0;
        List<AssessmentMessage> ais = questionMessages.stream()
                .filter(m -> "ai".equals(m.getSenderType()))
                .toList();
        for (int i = 0; i < ais.size(); i++) {
            AssessmentMessage ai = ais.get(i);
            // 题干消息（内容与题面相同）不算追问；没有题干消息时第一条 ai 消息就是追问，要保留
            if (Objects.equals(ai.getContent(), question.getContentSnapshot())) continue;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", ai.getId());
            view.put("content", ai.getContent());
            if (turnIndex < turns.size() && Objects.equals(turns.get(turnIndex).ask(), ai.getContent())) {
                view.put("answer", turns.get(turnIndex++).answer());
            }
            out.add(view);
        }
        return out;
    }

    public Map<String, Object> result(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        // 已完成：返回不可变报告快照（10.8.3 语义，前端 ReportSnapshotDetail 为快照渲染器），
        // 附 assessment 视图兜底旧前端结果页。
        if (AssessmentRepository.COMPLETED_STATUSES.contains(assessment.getStatus())) {
            Map<String, Object> snapshot = snapshots.freeze(assessmentId);
            snapshot.put("assessment", assessmentView(assessment));
            List<AssessmentQuestion> qs = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
            List<Long> qIds = qs.stream().map(AssessmentQuestion::getId).toList();
            snapshot.put("questions", qs.stream().map(this::snapshotView).toList());
            snapshot.put("answers", assessments.findByAssessmentQuestionIdIn(qIds).stream()
                    .map(this::answerView).toList());
            snapshot.put("hasScoringFailure", assessments.findByAssessmentQuestionIdIn(qIds).stream()
                    .anyMatch(a -> "scoring_failed".equals(a.getResultStatus())));
            return snapshot;
        }
        EngineService.ReportData freshReport = null;
        if ("completed".equals(assessment.getStatus())) {
            freshReport = engine.reportData(assessmentId);
            assessment = assessments.findById(assessmentId).orElse(assessment);
        }
        List<AssessmentQuestion> questions = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<Long> questionIds = questions.stream().map(AssessmentQuestion::getId).toList();

        // —— 报告增强：维度分析文本（来自 AI 建议 JSON）、测评前六维（历史维度分）、技能树（考察点得分） ——
        Map<String, Object> adviceData = parseReportAdvice(assessment.getAdvice());
        @SuppressWarnings("unchecked")
        Map<String, String> adviceDims = adviceData == null ? Map.of()
                : (Map<String, String>) adviceData.getOrDefault("dimensions", Map.of());

        List<Map<String, Object>> dimViews = new ArrayList<>();
        List<?> dimRows = freshReport == null
                ? dimensionScores.findByAssessmentId(assessmentId)
                : freshReport.dimensions();
        for (Object row : dimRows) {
            Map<String, Object> view = new LinkedHashMap<>();
            if (row instanceof EngineService.ReportDimension rd) {
                view.put("dimension", rd.name()); view.put("name", rd.name());
                view.put("score", rd.score()); view.put("questionCount", rd.questionCount());
                view.put("tested", rd.tested());
            } else if (row instanceof AssessmentDimensionScore ds) {
                view.put("dimension", ds.getDimension()); view.put("name", ds.getDimension());
                view.put("score", ds.getScore()); view.put("questionCount", ds.getQuestionCount());
                view.put("tested", ds.getScore() != null && ds.getScore() > 0);
            } else {
                continue;
            }
            view.put("analysis", adviceDims.getOrDefault(String.valueOf(view.get("dimension")), ""));
            dimViews.add(view);
        }

        // 测评前六维：该学生该班级在本场开始前最近一次历史测评的维度分
        List<Map<String, Object>> beforeViews = new ArrayList<>();
        Map<String, AssessmentDimensionScore> latestBefore = new LinkedHashMap<>();
        if (assessment.getClassId() != null) {
            for (AssessmentDimensionScore h : dimensionScores
                    .findHistoryByClassAndStudent(assessment.getClassId(), assessment.getStudentUserId())) {
                if (assessment.getStartedAt() != null && h.getCreatedAt() != null
                        && !h.getCreatedAt().isBefore(assessment.getStartedAt())) continue;
                latestBefore.putIfAbsent(h.getDimension(), h);
            }
        }
        for (Map<String, Object> dv : dimViews) {
            AssessmentDimensionScore h = latestBefore.get(dv.get("dimension"));
            Map<String, Object> bv = new LinkedHashMap<>();
            bv.put("dimension", dv.get("dimension")); bv.put("name", dv.get("dimension"));
            bv.put("score", h == null ? null : h.getScore());
            bv.put("questionCount", h == null ? 0 : h.getQuestionCount());
            beforeViews.add(bv);
        }

        // 技能树：六维考察点，状态由得分推导（>=75 已掌握 / >0 学习中 / 未测 locked）
        List<Map<String, Object>> skillTree = new ArrayList<>();
        List<?> pointRows = freshReport == null
                ? pointScores.findByAssessmentId(assessmentId)
                : freshReport.points();
        for (Object row : pointRows) {
            String name; String dimension; Double score; String status; boolean lit;
            if (row instanceof EngineService.ReportPoint p) {
                name = p.name(); dimension = p.dimension();
                score = p.theta() == null ? null : 100.0 * p.theta();
                lit = Boolean.TRUE.equals(p.lit());
                status = (lit || (score != null && score >= 75)) ? "mastered"
                        : (score != null && score > 0 ? "learning" : "locked");
            } else if (row instanceof AssessmentPointScore ps) {
                name = ps.getAssessmentPoint(); dimension = ps.getDimension();
                score = ps.getScore();
                lit = score != null && score >= 75;
                status = lit ? "mastered" : (score != null && score > 0 ? "learning" : "locked");
            } else {
                continue;
            }
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("name", name); view.put("assessmentPoint", name);
            view.put("dimension", dimension);
            view.put("score", score == null ? null : Math.round(score * 100.0) / 100.0);
            view.put("status", status);
            view.put("lit", lit);
            skillTree.add(view);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessment", assessmentView(assessment));
        data.put("questions", questions.stream().map(this::snapshotView).toList());
        data.put("answers", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .map(this::answerView).toList());
        data.put("dimensions", dimViews);
        data.put("beforeDimensions", beforeViews);
        data.put("skillTree", skillTree);
        data.put("advice", assessment.getAdvice());
        data.put("hasScoringFailure", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .anyMatch(a -> "scoring_failed".equals(a.getResultStatus())));
        return data;
    }

    /** 解析提交体里的附件 ID（v9 前端实操题上传成果后随最终方案提交）。 */
    private List<Long> parseArtifactIds(Map<String, Object> body) {
        if (body == null || !body.containsKey("artifactIds")) return List.of();
        Object raw = body.get("artifactIds");
        if (!(raw instanceof List<?> list)) return List.of();
        List<Long> ids = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Number n) {
                ids.add(n.longValue());
            } else if (o != null) {
                try {
                    ids.add(Long.parseLong(String.valueOf(o).trim()));
                } catch (NumberFormatException ignored) {}
            }
        }
        return ids;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseReportAdvice(String advice) {
        if (advice == null || advice.isBlank()) return null;
        try {
            Object v = mapper.readValue(advice, Object.class);
            return v instanceof Map ? (Map<String, Object>) v : null;
        } catch (Exception e) {
            return null;
        }
    }

    public Map<String, Object> complete(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        if ("in_progress".equals(assessment.getStatus())) {
            finishAssessment(assessmentId);
        }
        return result(assessmentId, userId);
    }

    public void chatStream(Long assessmentId, Long userId, Map<String, Object> body, OutputStream out) {
        Assessment assessment = owned(assessmentId, userId);
        if (!"in_progress".equals(assessment.getStatus())) {
            sse(out, "error", Map.of("message", "测评已结束"));
            return;
        }

        try {
        engine.initializeExistingAssessment(assessmentId);
        String content = String.valueOf(body == null ? "" : body.getOrDefault("content", "")).trim();
        List<Long> artifactIds = parseArtifactIds(body);
        // 显式 action（仓库前端：chat/answer/submit）与 v9 前端"只发 content 不带 action"两种契约都要兼容。
        boolean hasExplicitAction = body != null && body.get("action") != null
                && !String.valueOf(body.get("action")).trim().isEmpty();
        String action = hasExplicitAction ? String.valueOf(body.get("action")).trim().toLowerCase() : "";
        AssessmentQuestion current = currentQuestion(assessmentId);

            if (content.isBlank()) {
                if (current == null) {
                    openNextOrFinish(assessmentId, out);
                } else {
                    ensurePromptMessage(current);
                    sse(out, "question", questionEvent(current));
                }
                sse(out, "done", Map.of("reply", ""));
                return;
            }

            if (current == null) {
                sse(out, "error", Map.of("message", "当前没有待回答题目"));
                return;
            }

            if ("chat".equals(action)) {
                if (!"DIALOGUE".equalsIgnoreCase(current.getType())) {
                    sse(out, "error", Map.of("message", "非对话题请提交答案，不要使用普通聊天"));
                    return;
                }
                handleDialogueChat(current, content, out);
                sse(out, "done", Map.of("reply", ""));
                return;
            }

            if ("submit".equals(action)) {
                String finalSubmission = String.valueOf(
                        body == null ? content : body.getOrDefault("finalSubmission", content)).trim();
                if (awaitingFollowup(current)) {
                    handleFollowupAnswer(current, finalSubmission, out);
                } else if ("DIALOGUE".equalsIgnoreCase(current.getType())
                        || "PRACTICAL".equalsIgnoreCase(current.getType())) {
                    handleFinalSubmission(current, finalSubmission, artifactIds, out);
                } else {
                    handleInitialAnswer(current, finalSubmission, artifactIds, out);
                }
                sse(out, "done", Map.of("reply", ""));
                return;
            }

            // 无 action（v9 测评页只发 content）或 action=answer（仓库前端）：
            // 由后端按题目状态判断——正在追问就收追问答案，没答过就按初答评分，
            // 已经答完的对话题允许继续聊天，其余只把当前题目再发一次。
            if (awaitingFollowup(current)) {
                handleFollowupAnswer(current, content, out);
            } else if (hasInitialAnswer(current)) {
                if ("DIALOGUE".equalsIgnoreCase(current.getType())) {
                    handleDialogueChat(current, content, out);
                } else {
                    ensurePromptMessage(current);
                    sse(out, "question", questionEvent(current));
                }
            } else {
                handleInitialAnswer(current, content, artifactIds, out);
            }
            sse(out, "done", Map.of("reply", ""));
        } catch (BusinessException e) {
            sse(out, "error", Map.of("message", e.getMessage()));
        } catch (Exception e) {
            sse(out, "error", Map.of("message", "测评 Agent 执行失败：" + e.getMessage()));
        }
    }

    /**
     * 纯对话（对话模型窗口专用）：只做普通 LLM 对话并把消息入库（供 Agent 监测/自动保存），
     * 不评分、不触发追问、不推进状态机。正式作答必须走 chatStream（提交最终方案）。
     */
    public void plainChat(Long assessmentId, Long userId, String content, OutputStream out) {
        Assessment assessment = owned(assessmentId, userId);
        if (!"in_progress".equals(assessment.getStatus())) {
            sse(out, "error", Map.of("message", "测评已结束"));
            return;
        }
        engine.initializeExistingAssessment(assessmentId);
        String text = String.valueOf(content == null ? "" : content).trim();
        AssessmentQuestion current = currentQuestion(assessmentId);
        if (current == null) {
            sse(out, "error", Map.of("message", "当前没有进行中的题目，请先在「提交最终方案」中作答"));
            return;
        }
        if (text.isBlank()) {
            sse(out, "error", Map.of("message", "对话内容不能为空"));
            return;
        }
        try {
            List<LlmClient.ChatTurn> history = ordinaryConversation(current.getId());
            saveMessage(current.getAssessmentId(), current.getId(), "student", text);
            String reply = llm.chat(questionContext(current), history, text);
            saveMessage(current.getAssessmentId(), current.getId(), "llm", reply);
            sse(out, "delta", Map.of("text", reply));
            sse(out, "done", Map.of("reply", reply));
        } catch (BusinessException e) {
            sse(out, "error", Map.of("message", e.getMessage()));
        } catch (Exception e) {
            sse(out, "error", Map.of("message", "对话模型执行失败：" + e.getMessage()));
        }
    }

    private void handleInitialAnswer(AssessmentQuestion current, String content, List<Long> artifactIds, OutputStream out) {
        saveMessage(current.getAssessmentId(), current.getId(), "student", content);
        LlmClient.ScoreResult score = objectiveScore(current, content);
        EngineService.ScoreResultOutcome outcome = engine.scoreResult(
                current.getAssessmentId(), current.getQuestionId(), content,
                score.score(), score.r(), score.clarity(), score.comment(), List.of(), artifactIds);

        current = assessmentQuestions.findById(current.getId()).orElse(current);
        if (outcome.needFollowUp()) {
            LlmClient.FollowupDecision decision = llm.followup(
                    questionContext(current), content, List.of(), 0);
            if (decision.finished() || decision.question() == null || decision.question().isBlank()) {
                finishFollowup(current, decision.turns(), decision.endReason(), out);
            } else {
                saveMessage(current.getAssessmentId(), current.getId(), "ai", decision.question());
                sse(out, "followup", Map.of("text", decision.question()));
            }
            return;
        }

        sse(out, "answered", Map.of("questionId", current.getId(), "score", score.score(), "failed", false));
        openNextOrFinish(current.getAssessmentId(), out);
    }

    private LlmClient.ScoreResult objectiveScore(AssessmentQuestion current, String content) {
        if (!isObjective(current.getType()) || current.getAnswerSnapshot() == null
                || current.getAnswerSnapshot().isBlank()) {
            return llm.score(questionContext(current), content, List.of());
        }
        boolean correct = objectiveAnswerMatches(current.getOptionsSnapshot(), current.getAnswerSnapshot(), content);
        int score = correct ? 100 : 0;
        return new LlmClient.ScoreResult(
                score,
                correct ? 1.0 : 0.0,
                "high",
                correct ? "客观题答案正确" : "客观题答案错误，标准答案为：" + current.getAnswerSnapshot());
    }

    /**
     * 客观题判分要同时兼容两种提交格式：
     *  - 学生提交字母（"A"、"A. xxx"、"A：xxx"）→ normalizedChoice 归一成字母直接比；
     *  - 学生提交选项全文（v9 测评页点击选项后提交的就是选项文本）→
     *    标准答案是字母时，把选项文本按它在选项列表里的位置换算成字母再比。
     */
    private boolean objectiveAnswerMatches(String optionsJson, String standardAnswer, String studentAnswer) {
        String expected = normalizedChoice(standardAnswer);
        String given = normalizedChoice(studentAnswer);
        if (expected.equals(given)) return true;
        if (!expected.matches("[A-Z]")) return false;
        List<String> options = parseOptions(optionsJson);
        int expectedIndex = expected.charAt(0) - 'A';
        if (expectedIndex >= 0 && expectedIndex < options.size()
                && normalizedChoice(options.get(expectedIndex)).equals(given)) {
            return true;
        }
        // 学生按字母提交但被归一化吞掉了（例如只填了选项正文且恰好等于字母）→ 兜底按原字符串比较
        return Objects.equals(expected, given);
    }

    /** options 快照可能是 JSON 数组，也可能是换行分隔的文本（两种历史格式都见过）。 */
    @SuppressWarnings("unchecked")
    private List<String> parseOptions(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank()) return List.of();
        String trimmed = optionsJson.trim();
        if (trimmed.startsWith("[")) {
            try {
                List<Object> list = mapper.readValue(trimmed, List.class);
                return list.stream().map(String::valueOf).toList();
            } catch (Exception ignored) {
                // 不是合法 JSON 数组，落到换行解析
            }
        }
        return Arrays.stream(trimmed.split("\\r?\\n")).map(String::trim)
                .filter(s -> !s.isEmpty()).toList();
    }

    private boolean isObjective(String type) {
        String value = type == null ? "" : type.trim().toUpperCase();
        return "SINGLE".equals(value) || "SINGLE_CHOICE".equals(value) || "TRUE_FALSE".equals(value);
    }

    private String normalizedChoice(String value) {
        String text = value == null ? "" : value.trim().toUpperCase();
        text = text.replaceFirst("^[\\s\\(（]*([A-Z])[\\)）.、:：\\s]+.*$", "$1");
        text = text.replaceAll("\\s+", "");
        return text;
    }

    private void handleDialogueChat(AssessmentQuestion current, String content, OutputStream out) {
        if (content.isBlank()) throw new BusinessException("对话内容不能为空");
        List<LlmClient.ChatTurn> history = ordinaryConversation(current.getId());
        saveMessage(current.getAssessmentId(), current.getId(), "student", content);
        String reply = llm.chat(questionContext(current), history, content);
        saveMessage(current.getAssessmentId(), current.getId(), "llm", reply);
        sse(out, "delta", Map.of("text", reply));
    }

    private void handleFinalSubmission(AssessmentQuestion current, String finalSubmission, List<Long> artifactIds, OutputStream out) {
        if (finalSubmission.isBlank()) throw new BusinessException("请先提交最终结果");
        List<LlmClient.ChatTurn> conversation = userMessagesOnly(current.getId());
        LlmClient.ScoreResult score = llm.scoreSubmission(
                questionContext(current), finalSubmission, conversation, List.of());
        EngineService.ScoreResultOutcome outcome = engine.scoreResult(
                current.getAssessmentId(), current.getQuestionId(), finalSubmission,
                score.score(), score.r(), score.clarity(), score.comment(), List.of(), artifactIds);
        current = assessmentQuestions.findById(current.getId()).orElse(current);
        if (outcome.needFollowUp()) {
            LlmClient.FollowupDecision decision = llm.followup(
                    questionContext(current), finalSubmission, List.of(), 0);
            if (decision.finished() || decision.question() == null || decision.question().isBlank()) {
                finishFollowup(current, decision.turns(), decision.endReason(), out);
            } else {
                saveMessage(current.getAssessmentId(), current.getId(), "ai", decision.question());
                sse(out, "followup", Map.of("text", decision.question()));
            }
            return;
        }
        sse(out, "answered", Map.of("questionId", current.getId(), "score", score.score(), "failed", false));
        openNextOrFinish(current.getAssessmentId(), out);
    }

    private List<LlmClient.ChatTurn> ordinaryConversation(Long assessmentQuestionId) {
        return assessments.findByAssessmentQuestionIdOrderBySequenceNo(assessmentQuestionId).stream()
                .filter(message -> "student".equals(message.getSenderType())
                        || "llm".equals(message.getSenderType()))
                .map(message -> new LlmClient.ChatTurn(
                        "llm".equals(message.getSenderType()) ? "assistant" : "user",
                        message.getContent()))
                .toList();
    }

    /**
     * 评分用：只取学生对作答 AI 说的话（提示词），不带 AI 的回复。
     * 考官只看学生怎么使用 AI，不看 AI 回了什么；成果好坏另看 finalSubmission。
     */
    private List<LlmClient.ChatTurn> userMessagesOnly(Long assessmentQuestionId) {
        return assessments.findByAssessmentQuestionIdOrderBySequenceNo(assessmentQuestionId).stream()
                .filter(message -> "student".equals(message.getSenderType()))
                .map(message -> new LlmClient.ChatTurn("user", message.getContent()))
                .toList();
    }

    private void handleFollowupAnswer(AssessmentQuestion current, String content, OutputStream out) {
        saveMessage(current.getAssessmentId(), current.getId(), "student", content);
        List<AssessmentMessage> messages = assessments.findByAssessmentQuestionIdOrderBySequenceNo(current.getId());
        String originalAnswer = originalAnswer(messages);
        List<LlmClient.FollowupTurn> turns = followupTurns(messages);

        if (turns.size() >= 3 || saysCannotAnswer(content)) {
            finishFollowup(current, turns, saysCannotAnswer(content) ? "用户明确不会" : "3轮用完", out);
            return;
        }

        LlmClient.FollowupDecision decision = llm.followup(
                questionContext(current), originalAnswer, turns, turns.size());
        if (decision.finished() || decision.question() == null || decision.question().isBlank()) {
            finishFollowup(current, decision.turns() == null ? turns : decision.turns(),
                    decision.endReason(), out);
            return;
        }

        saveMessage(current.getAssessmentId(), current.getId(), "ai", decision.question());
        sse(out, "followup", Map.of("text", decision.question()));
    }

    private void finishFollowup(AssessmentQuestion current, List<LlmClient.FollowupTurn> turns,
                                String reason, OutputStream out) {
        List<AssessmentMessage> messages = assessments.findByAssessmentQuestionIdOrderBySequenceNo(current.getId());
        String originalAnswer = originalAnswer(messages);
        List<LlmClient.FollowupTurn> safeTurns = turns == null ? followupTurns(messages) : turns;
        AssessmentAnswer savedAnswer = assessments.findByAssessmentQuestionId(current.getId()).orElse(null);
        String finalSubmission = savedAnswer == null ? originalAnswer : savedAnswer.getAnswerContent();
        LlmClient.ScoreResult finalScore =
                ("DIALOGUE".equalsIgnoreCase(current.getType())
                        || "PRACTICAL".equalsIgnoreCase(current.getType()))
                        ? llm.scoreSubmission(questionContext(current), finalSubmission,
                        userMessagesOnly(current.getId()), safeTurns)
                        : llm.score(questionContext(current), originalAnswer, safeTurns);

        List<EngineService.FollowupTurn> engineTurns = safeTurns.stream()
                .map(t -> new EngineService.FollowupTurn(t.ask(), t.answer()))
                .toList();
        EngineService.FollowupOutcome outcome = engine.followupResult(
                current.getAssessmentId(), current.getQuestionId(), engineTurns,
                finalScore.r(), reason == null ? "已判断清楚" : reason,
                finalScore.comment(), false);

        sse(out, "answered", Map.of(
                "questionId", current.getId(),
                "score", finalScore.score(),
                "failed", false));
        if (outcome.nextQuestion() != null && !outcome.nextQuestion().finished()) {
            EngineService.NextQuestionResult next = outcome.nextQuestion();
            AssessmentQuestion nextQuestion = assessmentQuestions.findById(next.assessmentQuestionId()).orElse(null);
            if (nextQuestion != null) {
                ensurePromptMessage(nextQuestion);
                sse(out, "question", questionEvent(nextQuestion));
                return;
            }
        }
        if (outcome.finished()) {
            finishAssessment(current.getAssessmentId());
            sse(out, "finished", Map.of("assessmentId", current.getAssessmentId()));
        } else {
            openNextOrFinish(current.getAssessmentId(), out);
        }
    }

    private void openNextOrFinish(Long assessmentId, OutputStream out) {
        EngineService.NextQuestionResult next = engine.nextQuestion(assessmentId);
        if (next.finished()) {
            finishAssessment(assessmentId);
            sse(out, "finished", Map.of("assessmentId", assessmentId));
            return;
        }
        AssessmentQuestion aq = assessmentQuestions.findById(next.assessmentQuestionId())
                .orElseThrow(() -> new BusinessException("题目快照不存在"));
        ensurePromptMessage(aq);
        sse(out, "question", questionEvent(aq));
    }

    private void finishAssessment(Long assessmentId) {
        EngineService.ReportData reportData = engine.reportData(assessmentId);
        try {
            String reportText = llm.report(mapper.writeValueAsString(reportData));
            engine.saveReportText(new EngineService.ReportTextRequest(
                    assessmentId, reportText, Map.of(), List.of(), List.of()));
            Assessment a = assessments.findById(assessmentId).orElse(null);
            if (a != null) {
                a.setAdvice(reportText);
                assessments.save(a);
            }
        } catch (Exception ignored) {
            // Scoring and deterministic report data are already saved. Text report can be retried later.
        }
        // 报告快照（10.8.3）：不可变前后画像/技能树/AI 建议，前端报告快照页读取。
        // 失败不阻断主流程：freeze 幂等（report_snapshot_json 非空即复用）。
        try {
            if (reportData.finished()) snapshots.freeze(assessmentId);
        } catch (Exception ignored) {
            // Snapshot can be regenerated lazily by /reports/{id}/snapshot.
        }
    }

    private AssessmentQuestion currentQuestion(Long assessmentId) {
        return assessmentQuestions.findByAssessmentIdAndStatus(assessmentId, "sent").stream()
                .min(Comparator.comparing(AssessmentQuestion::getSequenceNo))
                .orElse(null);
    }

    private boolean awaitingFollowup(AssessmentQuestion question) {
        return question.getRInitial() != null
                && question.getRFinal() == null
                && !question.isFollowedUp();
    }

    /** 是否已保存过这道题的作答记录（初答或追问后都有）。 */
    private boolean hasInitialAnswer(AssessmentQuestion question) {
        return assessments.findByAssessmentQuestionId(question.getId()).isPresent();
    }

    private void ensurePromptMessage(AssessmentQuestion question) {
        List<AssessmentMessage> existing = assessments.findByAssessmentQuestionIdOrderBySequenceNo(question.getId());
        if (!existing.isEmpty() && "ai".equals(existing.get(0).getSenderType())) return;
        saveMessage(question.getAssessmentId(), question.getId(), "ai", question.getContentSnapshot());
    }

    private AssessmentMessage saveMessage(Long assessmentId, Long assessmentQuestionId,
                                          String sender, String content) {
        int seq = assessments.findByAssessmentIdOrderByCreatedAt(assessmentId).size() + 1;
        return assessments.saveMessage(new AssessmentMessage(
                assessmentId, assessmentQuestionId, sender, content, seq));
    }

    private String originalAnswer(List<AssessmentMessage> messages) {
        return messages.stream()
                .filter(m -> "student".equals(m.getSenderType()))
                .map(AssessmentMessage::getContent)
                .findFirst()
                .orElse("");
    }

    private List<LlmClient.FollowupTurn> followupTurns(List<AssessmentMessage> messages) {
        List<AssessmentMessage> student = messages.stream()
                .filter(m -> "student".equals(m.getSenderType()))
                .toList();
        if (student.size() <= 1) return List.of();

        List<LlmClient.FollowupTurn> turns = new ArrayList<>();
        String pendingAsk = null;
        boolean passedOriginalAnswer = false;
        for (AssessmentMessage message : messages) {
            if ("student".equals(message.getSenderType())) {
                if (!passedOriginalAnswer) {
                    passedOriginalAnswer = true;
                    continue;
                }
                if (pendingAsk != null) {
                    turns.add(new LlmClient.FollowupTurn(pendingAsk, message.getContent()));
                    pendingAsk = null;
                }
            } else if ("ai".equals(message.getSenderType()) && passedOriginalAnswer) {
                pendingAsk = message.getContent();
            }
        }
        return turns;
    }

    private boolean saysCannotAnswer(String content) {
        String text = content == null ? "" : content.trim();
        return text.contains("不知道") || text.contains("不会") || text.equalsIgnoreCase("no idea");
    }

    private LlmClient.QuestionContext questionContext(AssessmentQuestion q) {
        return new LlmClient.QuestionContext(q.getQuestionId(), q.getType(), null,
                q.getContentSnapshot(), q.getOptionsSnapshot(), q.getAnswerSnapshot(), q.getRubricSnapshot());
    }

    private Map<String, Object> questionEvent(AssessmentQuestion q) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", q.getId());
        data.put("questionId", q.getId());
        data.put("type", q.getType());
        data.put("content", q.getContentSnapshot());
        data.put("options", q.getOptionsSnapshot());
        data.put("status", q.getStatus());
        data.put("awaitingFollowup", awaitingFollowup(q));
        data.put("answered", "answered".equals(q.getStatus()));
        data.put("finalAnswer", assessments.findByAssessmentQuestionId(q.getId())
                .map(AssessmentAnswer::getAnswerContent).orElse(null));
        return data;
    }

    private Map<String, Object> assessmentView(Assessment a) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", a.getId());
        data.put("taskId", a.getTaskId());
        data.put("reportType", a.getTrainingConfig() != null ? "TRAINING" : a.getTaskId() != null ? "TASK" : "ASSESSMENT");
        data.put("classId", a.getClassId());
        data.put("studentUserId", a.getStudentUserId());
        data.put("questionCount", a.getQuestionCount());
        data.put("status", a.getStatus());
        data.put("totalScore", a.getTotalScore());
        data.put("averageScore", a.getAverageScore());
        data.put("abilityLevel", a.getAbilityLevel());
        data.put("advice", a.getAdvice());
        data.put("startedAt", a.getStartedAt());
        data.put("completedAt", a.getCompletedAt());
        return data;
    }

    private Map<String, Object> snapshotView(AssessmentQuestion q) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", q.getId());
        data.put("sequenceNo", q.getSequenceNo());
        data.put("type", q.getType());
        data.put("contentSnapshot", q.getContentSnapshot());
        data.put("optionsSnapshot", q.getOptionsSnapshot());
        data.put("rubricSnapshot", q.getRubricSnapshot());
        data.put("difficultySnapshot", q.getDifficultySnapshot());
        data.put("status", q.getStatus());
        data.put("finished", q.isFinished());
        return data;
    }

    private Map<String, Object> answerView(AssessmentAnswer answer) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessmentQuestionId", answer.getAssessmentQuestionId());
        data.put("answerContent", answer.getAnswerContent());
        data.put("resultStatus", answer.getResultStatus());
        data.put("score", answer.getScore());
        data.put("scoringReason", answer.getScoringReason());
        data.put("scoringEvidence", answer.getScoringEvidence());
        data.put("confidence", answer.getConfidence());
        return data;
    }

    private List<Map<String, Object>> conversationMessages(List<AssessmentMessage> rows,
                                                           List<AssessmentQuestion> questions) {
        Map<Long, List<AssessmentMessage>> grouped = new LinkedHashMap<>();
        for (AssessmentMessage row : rows) {
            grouped.computeIfAbsent(row.getAssessmentQuestionId(), ignored -> new ArrayList<>()).add(row);
        }
        List<Map<String, Object>> result = new ArrayList<>();
        for (AssessmentQuestion question : questions) {
            List<AssessmentMessage> messages = grouped.getOrDefault(question.getId(), List.of());
            if (messages.isEmpty() || !"ai".equals(messages.get(0).getSenderType())) {
                result.add(promptMessage(question));
            }
            for (int i = 0; i < messages.size(); i++) {
                Map<String, Object> view = messageView(messages.get(i));
                if (i == 0) {
                    view.put("questionPrompt", "ai".equals(messages.get(i).getSenderType()));
                    view.put("questionAnswered", "answered".equals(question.getStatus()));
                }
                result.add(view);
            }
        }
        return result;
    }

    private Map<String, Object> promptMessage(AssessmentQuestion q) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", "q-" + q.getId());
        data.put("senderType", "ai");
        data.put("content", q.getContentSnapshot());
        data.put("assessmentQuestionId", q.getId());
        data.put("sequenceNo", 0);
        data.put("createdAt", q.getSentAt());
        data.put("questionPrompt", true);
        data.put("questionAnswered", "answered".equals(q.getStatus()));
        data.put("synthetic", true);
        return data;
    }

    private Map<String, Object> messageView(AssessmentMessage m) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", m.getId());
        data.put("senderType", m.getSenderType());
        data.put("content", m.getContent());
        data.put("assessmentQuestionId", m.getAssessmentQuestionId());
        data.put("sequenceNo", m.getSequenceNo());
        data.put("createdAt", m.getCreatedAt());
        return data;
    }

    private Assessment owned(Long assessmentId, Long userId) {
        Assessment assessment = assessments.findById(assessmentId)
                .orElseThrow(() -> new BusinessException("测评不存在"));
        if (!Objects.equals(assessment.getStudentUserId(), userId)) {
            throw new BusinessException("无权访问该测评");
        }
        return assessment;
    }

    private void sse(OutputStream out, String event, Object payload) {
        try {
            out.write(("event: " + event + "\ndata: "
                    + mapper.writeValueAsString(payload) + "\n\n").getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (Exception e) {
            throw new BusinessException("写入 SSE 失败：" + e.getMessage());
        }
    }
}
