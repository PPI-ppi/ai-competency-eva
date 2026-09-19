package com.huiqiyikang.assessment.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * 自适应编排器：纯确定性数值计算模块，不调用任何大模型。
 * 公式严格对齐《自适应引擎 5.0》。所有 θ/c 计算在这里，LLM 只负责评分/追问/报告文字。
 *
 * 第一版实现：start 初始化 + next-question 选题 + score-result 评分回传。
 * 追问结果、报告、实操文件接口第二阶段补。
 */
@Service
public class EngineService {
    // ---- 算法常量（对齐文档 4.9 参数表） ----
    private static final double THETA_INIT = 0.0;
    private static final double CONFIDENCE_INIT = 0.0;
    private static final double ETA = 0.25;            // 学习率
    private static final double CONVERGE_THRESHOLD = 0.75;
    private static final double C_MAX = 0.95;
    private static final double EPSILON = 0.01;       // 随机扰动
    private static final double FOLLOWUP_SIGNAL = 1.5; // |s|>=1.5 触发追问
    private static final int MAX_QUESTIONS = 30;       // 单场题量硬上限

    private final AssessmentService assessments;
    private final QuestionService questions;
    private final AssessmentQuestionRepository assessmentQuestions;
    private final AssessmentAnswerRepository answers;
    private final AssessmentPointStateRepository pointStates;
    private final ClassQuestionFreshnessRepository freshnessRepo;
    private final StudentPointProfileRepository profiles;
    private final AssessmentEngineLogRepository engineLogs;
    private final ClassQuestionRepository classQuestions;
    private final ObjectMapper mapper;

    public EngineService(AssessmentService assessments, QuestionService questions,
                         AssessmentQuestionRepository assessmentQuestions, AssessmentAnswerRepository answers,
                         AssessmentPointStateRepository pointStates, ClassQuestionFreshnessRepository freshnessRepo,
                         StudentPointProfileRepository profiles, AssessmentEngineLogRepository engineLogs,
                         ClassQuestionRepository classQuestions, ObjectMapper mapper) {
        this.assessments = assessments; this.questions = questions;
        this.assessmentQuestions = assessmentQuestions; this.answers = answers;
        this.pointStates = pointStates; this.freshnessRepo = freshnessRepo;
        this.profiles = profiles; this.engineLogs = engineLogs;
        this.classQuestions = classQuestions; this.mapper = mapper;
    }

    // ==================== 1. start：初始化 ====================

    public record StartResult(Long assessmentId, Long taskId, Long classId, Long studentUserId,
                               String status, Integer questionCount, List<PointWeight> points) {}
    public record PointWeight(String name, String dimension, Double weight) {}

    public StartResult start(Long taskId, Long classId, Long studentUserId,
                             List<String> dimensionNames, List<String> pointNames) {
        Assessment a;
        // 幂等：已有进行中的测评直接复用
        if (taskId != null) {
            a = assessments.findByTaskIdAndStudentUserId(taskId, studentUserId)
                    .orElseGet(() -> {
                        Assessment na = new Assessment(taskId, classId, studentUserId);
                        na.setQuestionCount(0);
                        return assessments.save(na);
                    });
        } else {
            a = new Assessment(classId, studentUserId);
            a.setQuestionCount(0);
            a = assessments.save(a);
        }

        // 如果这个测评已经初始化过考察点状态（断点续做），直接返回
        if (pointStates.countActive(a.getId()) > 0) {
            return buildStartResult(a, null);
        }

        // 解析考察点列表
        List<PointWeight> pointWeights = resolvePoints(taskId, a, dimensionNames, pointNames);
        // 复制权重快照到 assessments.point_weights
        try {
            a.setPointWeights(mapper.writeValueAsString(pointWeights.stream()
                    .collect(java.util.stream.Collectors.toMap(PointWeight::name, PointWeight::weight))));
            assessments.save(a);
        } catch (JsonProcessingException e) {
            throw new BusinessException("权重序列化失败");
        }

        // 为每个考察点建一行状态
        for (PointWeight pw : pointWeights) {
            AssessmentPointState s = new AssessmentPointState();
            s.setAssessmentId(a.getId()); s.setClassId(a.getClassId());
            s.setDimension(pw.dimension()); s.setAssessmentPoint(pw.name());
            s.setTheta(THETA_INIT); s.setConfidence(CONFIDENCE_INIT);
            s.setAnswerCount(0.0); s.setQuestionCount(0); s.setFollowUpCount(0);
            s.setStatus("active");
            pointStates.save(s);
        }

        log(a.getId(), studentUserId, a.getClassId(), "start", null,
                "points=" + pointWeights.size());
        return buildStartResult(a, pointWeights);
    }

    private StartResult buildStartResult(Assessment a, List<PointWeight> pw) {
        if (pw == null) {
            // 断点续做：从数据库读
            pw = pointStates.findByAssessmentId(a.getId()).stream()
                    .map(s -> new PointWeight(s.getAssessmentPoint(), s.getDimension(), 1.0))
                    .toList();
        }
        return new StartResult(a.getId(), a.getTaskId(), a.getClassId(), a.getStudentUserId(),
                a.getStatus(), a.getQuestionCount(), pw);
    }

    /**
     * 解析本场考察点与权重：
     * 任务型从 task 的 assessment_points / point_weights 读；自主练习等权 1.0。
     */
    private List<PointWeight> resolvePoints(Long taskId, Assessment a,
                                            List<String> dimNames, List<String> pointNames) {
        // 任务型：从任务继承
        if (taskId != null) {
            AssessmentTask task = assessments.findTask(taskId);
            List<String> points = parseJsonList(task.getAssessmentPoints());
            Map<String, Double> weights = parseWeights(task.getPointWeights());
            List<PointWeight> result = new ArrayList<>();
            for (String p : points) {
                result.add(new PointWeight(p, guessDimension(p),
                        weights.getOrDefault(p, 1.0)));
            }
            if (!result.isEmpty()) return result;
        }
        // 自主练习：等权
        List<PointWeight> result = new ArrayList<>();
        if (pointNames != null) {
            for (String p : pointNames) {
                result.add(new PointWeight(p, guessDimension(p), 1.0));
            }
        }
        if (result.isEmpty()) {
            // 兜底：取班级题库里出现过的所有考察点
            result.add(new PointWeight("提示词书写", "提示词工程", 1.0));
        }
        return result;
    }

    // ==================== 2. next-question：三级选题 ====================

    public record NextQuestionResult(Long assessmentQuestionId, boolean finished, String finishReason,
                                      Integer sequenceNo, Long questionId, String pointName,
                                      String dimensionName, Integer difficultyLevel, Double difficultyValue,
                                      boolean difficultyAdjusted, Double expectedR,
                                      int answeredCount, boolean hasMore, QuestionVO question) {}

    public record QuestionVO(Long id, String type, String title, String content, String options,
                             String answer, String rubric, String assessmentPoints,
                             String artifactType, String artifactRequirement) {}

    public NextQuestionResult nextQuestion(Long assessmentId) {
        Assessment a = assessments.findById(assessmentId)
                .orElseThrow(() -> new BusinessException("测评不存在", 404));

        // 2.1 检查是否已有未答完的题（断点续做）
        List<AssessmentQuestion> pending = assessmentQuestions.findByAssessmentIdAndStatus(assessmentId, "sent");
        if (!pending.isEmpty()) {
            return toNextQuestionResult(pending.get(0), false, null, 0.0, false);
        }

        // 2.2 可考察点列表
        List<AssessmentPointState> active = pointStates.findActiveByAssessmentId(assessmentId);
        if (active.isEmpty()) {
            return finishResult(assessmentId, "all_converged");
        }

        // 题量上限
        int answeredCount = assessmentQuestions.findByAssessmentIdOrderBySequenceNo(assessmentId).size();
        if (answeredCount >= MAX_QUESTIONS) {
            return finishResult(assessmentId, "max_questions");
        }
        if (a.getQuestionCount() != null && a.getQuestionCount() > 0 && answeredCount >= a.getQuestionCount()) {
            return finishResult(assessmentId, "question_limit");
        }

        // 2.3 第一级：选考察点 f = w·(1-c) + ε
        AssessmentPointState chosen = pickPoint(active);

        // 2.4 第二级：选难度档
        Double currentProfile = findProfileValue(a.getStudentUserId(), a.getClassId(), chosen.getAssessmentPoint());
        int difficultyLevel = pickDifficultyLevel(chosen, answeredCount, currentProfile);
        double d = difficultyLevel / 5.0;

        // 2.5 第三级：选题（同档优先，无题向相邻档扩展）
        Question q = pickQuestion(a.getClassId(), chosen.getAssessmentPoint(), difficultyLevel, answeredIds(assessmentId));
        if (q == null) {
            // 相邻档回退
            for (int delta : new int[]{1, -1, 2, -2}) {
                int alt = Math.max(1, Math.min(5, difficultyLevel + delta));
                q = pickQuestion(a.getClassId(), chosen.getAssessmentPoint(), alt, answeredIds(assessmentId));
                if (q != null) { difficultyLevel = alt; d = alt / 5.0; break; }
            }
        }
        if (q == null) {
            return finishResult(assessmentId, "no_question");
        }

        // 2.6 建发题快照
        int seqNo = answeredCount + 1;
        AssessmentQuestion aq = new AssessmentQuestion(assessmentId, q.getId(), seqNo,
                q.getType(), q.getContent(), q.getOptions(), q.getAnswer(), q.getRubric(), q.getDifficulty());
        aq.setPointName(chosen.getAssessmentPoint());
        aq.setDimensionName(chosen.getDimension());
        aq.setDifficultyValue(d);
        double expectedR = expectedR(chosen.getTheta(), d);
        aq.setRInitial(null); // 评分后填
        aq.setStatus("sent");
        assessmentQuestions.save(aq);

        // 更新考察点出题计数
        chosen.setQuestionCount(chosen.getQuestionCount() + 1);
        pointStates.save(chosen);

        log(assessmentId, a.getStudentUserId(), a.getClassId(), "select", chosen.getAssessmentPoint(),
                "qid=" + q.getId() + " d=" + d + " level=" + difficultyLevel);

        return toNextQuestionResult(aq, false, null, expectedR, difficultyLevel != chosen.getQuestionCount() - 1);
    }

    // ==================== 3. score-result：评分回传 ====================

    public record ScoreResultOutcome(Long assessmentQuestionId, Long questionId,
                                      Double rInitial, Double expectedR, Double signalValue,
                                      boolean needFollowUp, String followUpReason,
                                      Double currentTheta, Double currentConfidence, String resultStatus) {}

    public ScoreResultOutcome scoreResult(Long assessmentId, Long questionId, String answerContent,
                                           int score, double r, String clarity, String comment,
                                           List<Map<String, Object>> messages, List<Long> artifactIds) {
        AssessmentQuestion aq = assessmentQuestions.findByAssessmentIdAndQuestionId(assessmentId, questionId)
                .orElseThrow(() -> new BusinessException("题目不存在", 404));
        AssessmentPointState state = pointStates.findByAssessmentIdAndPoint(assessmentId, aq.getPointName())
                .orElseThrow(() -> new BusinessException("考察点状态不存在"));

        double d = aq.getDifficultyValue() != null ? aq.getDifficultyValue() : (aq.getDifficultySnapshot() != null ? aq.getDifficultySnapshot() / 5.0 : 0.6);
        double thetaOld = state.getTheta();
        double expectedR = expectedR(thetaOld, d);
        double u = 1 - Math.abs(2 * expectedR - 1) + 0.1;
        double signal = (r - expectedR) / u;

        // 记录初始评分
        aq.setRInitial(r);
        aq.setSignalValue(signal);
        aq.setAnsweredAt(java.time.Instant.now());

        // 判断追问
        boolean lowClarity = "low".equalsIgnoreCase(clarity);
        boolean rBelowExpected = r < expectedR;
        boolean strongSignal = Math.abs(signal) >= FOLLOWUP_SIGNAL;
        boolean needFollowUp = (rBelowExpected && strongSignal) || lowClarity;
        String followUpReason = needFollowUp
                ? (rBelowExpected && strongSignal && lowClarity ? "signal_and_clarity"
                   : (rBelowExpected && strongSignal ? "signal" : "clarity"))
                : "none";

        if (!needFollowUp) {
            // 直接更新 θ/c
            updateState(state, r, expectedR, u, signal, d, aq);
            aq.setFollowedUp(false);
            aq.setFollowUpTurns(0);
        }
        // 需要追问时暂不更新，等 followup-result

        assessmentQuestions.save(aq);
        log(assessmentId, state.getAssessmentId() == null ? 0L : 0L, 0L, "score", state.getAssessmentPoint(),
                "r=" + r + " s=" + String.format("%.3f", signal) + " fu=" + needFollowUp);

        return new ScoreResultOutcome(aq.getId(), questionId, r, expectedR, signal,
                needFollowUp, followUpReason, state.getTheta(), state.getConfidence(),
                needFollowUp ? "pending_followup" : "scored");
    }

    // ==================== 算法内部 ====================

    private void updateState(AssessmentPointState state, double rFinal, double expectedR,
                              double u, double signal, double d, AssessmentQuestion aq) {
        double thetaOld = state.getTheta();
        double m = 1 - Math.abs(thetaOld - d);
        double thetaNew = clamp(thetaOld + ETA * signal * m, 0, 1);
        double consistency = Math.max(0.2, 1 - Math.abs(signal) / 3.0);
        double cOld = state.getConfidence();
        double cNew = Math.min(C_MAX, cOld + 0.5 * (1 - cOld) * consistency);

        // 计数权重：客观题 0.5，实操/对话 1.0
        double weight = ("单选题".equals(aq.getType()) || "判断题".equals(aq.getType())) ? 0.5 : 1.0;
        double answerCountNew = state.getAnswerCount() + weight;

        // 状态迁移
        String status = state.getStatus();
        if (cNew >= CONVERGE_THRESHOLD) {
            status = "converged";
        } else if (answerCountNew >= 3.0 && weight >= 1.0 || answerCountNew >= 6.0 && weight == 0.5) {
            status = "removed";
        }

        state.setTheta(thetaNew);
        state.setConfidence(cNew);
        state.setAnswerCount(answerCountNew);
        state.setLastDifficulty(d);
        state.setStatus(status);
        pointStates.save(state);

        // 回填题目快照
        aq.setRFinal(rFinal);
    }

    private double expectedR(double theta, double d) {
        return 1.0 / (1.0 + Math.exp(-2.5 * (theta - d)));
    }

    private double clamp(double v, double lo, double hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    private AssessmentPointState pickPoint(List<AssessmentPointState> active) {
        // f = w·(1-c) + ε，w 暂取 1.0（权重在 start 时记录，第一版简化）
        Random rnd = new Random();
        AssessmentPointState best = null;
        double bestF = -1;
        for (AssessmentPointState s : active) {
            double w = 1.0;
            double f = w * (1 - s.getConfidence()) + EPSILON * rnd.nextDouble();
            if (f > bestF) { bestF = f; best = s; }
        }
        return best;
    }

    private int pickDifficultyLevel(AssessmentPointState state, int answeredCount, Double profile) {
        // 冷启动：无历史题，画像值 >=0.45 向上取档（默认 d=0.6 即 level=3）
        if (answeredCount < 2) {
            if (profile != null && profile >= 0.45) return 4; // 第4档 0.8
            return 3; // 默认 0.6
        }
        // 近2题正确率决定升降档（第一版简化：按 lastDifficulty ±1）
        if (state.getLastDifficulty() != null) {
            int cur = (int) Math.round(state.getLastDifficulty() * 5);
            // 第一版简化：保持当前档，后续按正确率调整
            return Math.max(1, Math.min(5, cur));
        }
        return 3;
    }

    private Question pickQuestion(Long classId, String pointName, int difficultyLevel, Set<Long> excludeIds) {
        // 简化：从公开题库里找匹配考察点+难度、未做过的题
        List<Question> pool = questions.publicList();
        for (Question q : pool) {
            if (excludeIds.contains(q.getId())) continue;
            if (q.getDifficulty() == null || q.getDifficulty() != difficultyLevel) continue;
            String points = q.getAssessmentPoints();
            if (points == null || !points.contains(pointName)) continue;
            return q;
        }
        return null;
    }

    private Set<Long> answeredIds(Long assessmentId) {
        Set<Long> ids = new HashSet<>();
        for (AssessmentQuestion aq : assessmentQuestions.findByAssessmentIdOrderBySequenceNo(assessmentId)) {
            ids.add(aq.getQuestionId());
        }
        return ids;
    }

    private Double findProfileValue(Long studentId, Long classId, String point) {
        return profiles.findByKey(classId, studentId, point)
                .map(StudentPointProfile::getProfileValue).orElse(null);
    }

    private NextQuestionResult finishResult(Long assessmentId, String reason) {
        return new NextQuestionResult(null, true, reason, 0, null, null, null,
                0, 0.0, false, 0, false, null);
    }

    private NextQuestionResult toNextQuestionResult(AssessmentQuestion aq, boolean finished,
                                                      String reason, double expectedR, boolean adjusted) {
        Question q = questions.findById(aq.getQuestionId()).orElse(null);
        QuestionVO vo = q == null ? null : new QuestionVO(q.getId(), q.getType(), q.getTitle(),
                q.getContent(), q.getOptions(), q.getAnswer(), q.getRubric(),
                q.getAssessmentPoints(), q.getArtifactType(), q.getArtifactRequirement());
        return new NextQuestionResult(aq.getId(), finished, reason, aq.getSequenceNo(),
                aq.getQuestionId(), aq.getPointName(), aq.getDimensionName(),
                aq.getDifficultySnapshot(), aq.getDifficultyValue(), adjusted, expectedR,
                0, true, vo);
    }

    // ==================== JSON 工具 ====================

    private List<String> parseJsonList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try { return mapper.readValue(json, new TypeReference<List<String>>() {}); }
        catch (Exception e) { return List.of(); }
    }

    private Map<String, Double> parseWeights(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try { return mapper.readValue(json, new TypeReference<Map<String, Double>>() {}); }
        catch (Exception e) { return Map.of(); }
    }

    private String guessDimension(String point) {
        // 第一版简化：按关键词猜维度，后续建考察点-维度映射表
        if (point.contains("提示词")) return "提示词工程";
        if (point.contains("AI工具") || point.contains("工具")) return "AI工具使用";
        if (point.contains("评估") || point.contains("结果")) return "AI结果评估与优化";
        if (point.contains("伦理") || point.contains("合规")) return "AI伦理与合规";
        if (point.contains("协同") || point.contains("问题")) return "人机协同解决问题";
        return "AI基础认知";
    }

    private void log(Long assessmentId, Long studentId, Long classId,
                     String event, String point, String payload) {
        AssessmentEngineLog l = new AssessmentEngineLog();
        l.setAssessmentId(assessmentId); l.setStudentUserId(studentId); l.setClassId(classId);
        l.setEvent(event); l.setAssessmentPoint(point); l.setPayload(payload);
        engineLogs.save(l);
    }
}
