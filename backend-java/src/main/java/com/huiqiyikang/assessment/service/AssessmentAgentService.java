package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.entity.AssessmentAnswer;
import com.huiqiyikang.assessment.entity.AssessmentMessage;
import com.huiqiyikang.assessment.entity.AssessmentQuestion;
import com.huiqiyikang.assessment.mapper.AssessmentDimensionScoreRepository;
import com.huiqiyikang.assessment.mapper.AssessmentPointScoreRepository;
import com.huiqiyikang.assessment.mapper.AssessmentQuestionRepository;
import org.springframework.stereotype.Service;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
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
    private final ObjectMapper mapper;

    public AssessmentAgentService(AssessmentService assessments, EngineService engine, LlmClient llm,
                                  AssessmentQuestionRepository assessmentQuestions,
                                  AssessmentDimensionScoreRepository dimensionScores,
                                  AssessmentPointScoreRepository pointScores,
                                  ObjectMapper mapper) {
        this.assessments = assessments;
        this.engine = engine;
        this.llm = llm;
        this.assessmentQuestions = assessmentQuestions;
        this.dimensionScores = dimensionScores;
        this.pointScores = pointScores;
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
        return data;
    }

    public Map<String, Object> result(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        EngineService.ReportData freshReport = null;
        if ("completed".equals(assessment.getStatus())) {
            freshReport = engine.reportData(assessmentId);
            assessment = assessments.findById(assessmentId).orElse(assessment);
        }
        List<AssessmentQuestion> questions = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<Long> questionIds = questions.stream().map(AssessmentQuestion::getId).toList();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessment", assessmentView(assessment));
        data.put("questions", questions.stream().map(this::snapshotView).toList());
        data.put("answers", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .map(this::answerView).toList());
        data.put("dimensions", freshReport == null
                ? dimensionScores.findByAssessmentId(assessmentId)
                : freshReport.dimensions());
        data.put("points", freshReport == null
                ? pointScores.findByAssessmentId(assessmentId)
                : freshReport.points());
        data.put("advice", assessment.getAdvice());
        data.put("hasScoringFailure", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .anyMatch(a -> "scoring_failed".equals(a.getResultStatus())));
        return data;
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

        engine.initializeExistingAssessment(assessmentId);
        String content = String.valueOf(body == null ? "" : body.getOrDefault("content", "")).trim();
        AssessmentQuestion current = currentQuestion(assessmentId);

        try {
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

            if (awaitingFollowup(current)) {
                handleFollowupAnswer(current, content, out);
            } else {
                handleInitialAnswer(current, content, out);
            }
            sse(out, "done", Map.of("reply", ""));
        } catch (BusinessException e) {
            sse(out, "error", Map.of("message", e.getMessage()));
        } catch (Exception e) {
            sse(out, "error", Map.of("message", "测评 Agent 执行失败：" + e.getMessage()));
        }
    }

    private void handleInitialAnswer(AssessmentQuestion current, String content, OutputStream out) {
        saveMessage(current.getAssessmentId(), current.getId(), "student", content);
        LlmClient.ScoreResult score = llm.score(questionContext(current), content, List.of());
        EngineService.ScoreResultOutcome outcome = engine.scoreResult(
                current.getAssessmentId(), current.getQuestionId(), content,
                score.score(), score.r(), score.clarity(), score.comment(), List.of(), List.of());

        current = assessmentQuestions.findById(current.getId()).orElse(current);
        if (outcome.needFollowUp()) {
            LlmClient.FollowupDecision decision = llm.followup(
                    questionContext(current), content, List.of(), 0);
            if (decision.finished() || decision.question() == null || decision.question().isBlank()) {
                finishFollowup(current, decision.turns(), decision.endReason(), out);
            } else {
                saveMessage(current.getAssessmentId(), current.getId(), "ai", decision.question());
                sse(out, "delta", Map.of("text", decision.question()));
            }
            return;
        }

        sse(out, "answered", Map.of("questionId", current.getId(), "score", score.score(), "failed", false));
        openNextOrFinish(current.getAssessmentId(), out);
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
        sse(out, "delta", Map.of("text", decision.question()));
    }

    private void finishFollowup(AssessmentQuestion current, List<LlmClient.FollowupTurn> turns,
                                String reason, OutputStream out) {
        List<AssessmentMessage> messages = assessments.findByAssessmentQuestionIdOrderBySequenceNo(current.getId());
        String originalAnswer = originalAnswer(messages);
        List<LlmClient.FollowupTurn> safeTurns = turns == null ? followupTurns(messages) : turns;
        LlmClient.ScoreResult finalScore = llm.score(questionContext(current), originalAnswer, safeTurns);

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
        data.put("content", q.getContentSnapshot());
        data.put("options", q.getOptionsSnapshot());
        return data;
    }

    private Map<String, Object> assessmentView(Assessment a) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", a.getId());
        data.put("taskId", a.getTaskId());
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
