package com.huiqiyikang.assessment.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.http.HttpStatus;
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
    private static final double ETA = 0.83;            // 学习率
    private static final double CONVERGE_THRESHOLD = 0.60; // 收敛阈值
    private static final double C_GROWTH = 0.5;       // 置信度增长系数
    private static final double C_MAX = 0.95;
    private static final double EPSILON = 0.01;       // 随机扰动
    private static final double FOLLOWUP_SIGNAL = 1.5; // |s|>=1.5 触发追问
    private static final int MAX_QUESTIONS = 30;       // 单场题量硬上限

    // 六维固定顺序（雷达图/报告都按此输出，未测维度也给占位值）
    private static final List<String> DIMENSION_ORDER = List.of(
            "AI基础认知", "提示词工程", "AI工具使用",
            "AI结果评估与优化", "人机协同解决问题", "AI伦理与合规");

    private final AssessmentService assessments;
    private final QuestionService questions;
    private final AssessmentQuestionRepository assessmentQuestions;
    private final AssessmentAnswerRepository answers;
    private final AssessmentPointStateRepository pointStates;
    private final ClassQuestionFreshnessRepository freshnessRepo;
    private final StudentPointProfileRepository profiles;
    private final AssessmentEngineLogRepository engineLogs;
    private final ClassQuestionRepository classQuestions;
    private final ClassRoomRepository classRoomRepository;
    private final AssessmentMessageRepository messages;
    private final AssessmentDimensionScoreRepository dimensionScores;
    private final AssessmentPointScoreRepository pointScores;
    private final ObjectMapper mapper;

    public EngineService(AssessmentService assessments, QuestionService questions,
                         AssessmentQuestionRepository assessmentQuestions, AssessmentAnswerRepository answers,
                         AssessmentPointStateRepository pointStates, ClassQuestionFreshnessRepository freshnessRepo,
                         StudentPointProfileRepository profiles, AssessmentEngineLogRepository engineLogs,
                         ClassQuestionRepository classQuestions, ClassRoomRepository classRoomRepository,
                         AssessmentMessageRepository messages,
                         AssessmentDimensionScoreRepository dimensionScores,
                         AssessmentPointScoreRepository pointScores, ObjectMapper mapper) {
        this.assessments = assessments; this.questions = questions;
        this.assessmentQuestions = assessmentQuestions; this.answers = answers;
        this.pointStates = pointStates; this.freshnessRepo = freshnessRepo;
        this.profiles = profiles; this.engineLogs = engineLogs;
        this.classQuestions = classQuestions;
        this.classRoomRepository = classRoomRepository;
        this.messages = messages; this.dimensionScores = dimensionScores;
        this.pointScores = pointScores; this.mapper = mapper;
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
            a = new Assessment(classId != null ? classId : 0L, studentUserId);
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

    public StartResult initializeExistingAssessment(Long assessmentId) {
        Assessment a = assessments.findById(assessmentId)
                .orElseThrow(() -> new BusinessException("测评不存在", HttpStatus.NOT_FOUND));
        if (!pointStates.findByAssessmentId(a.getId()).isEmpty()) {
            return buildStartResult(a, null);
        }

        List<PointWeight> pointWeights = resolvePoints(
                a.getTaskId(), a, parseJsonList(a.getDimensions()), parseJsonList(a.getAssessmentPoints()));
        try {
            a.setPointWeights(mapper.writeValueAsString(pointWeights.stream()
                    .collect(java.util.stream.Collectors.toMap(PointWeight::name, PointWeight::weight))));
            assessments.save(a);
        } catch (JsonProcessingException e) {
            throw new BusinessException("权重序列化失败");
        }

        for (PointWeight pw : pointWeights) {
            AssessmentPointState s = new AssessmentPointState();
            s.setAssessmentId(a.getId()); s.setClassId(a.getClassId());
            s.setDimension(pw.dimension()); s.setAssessmentPoint(pw.name());
            s.setTheta(THETA_INIT); s.setConfidence(CONFIDENCE_INIT);
            s.setAnswerCount(0.0); s.setQuestionCount(0); s.setFollowUpCount(0);
            s.setStatus("active");
            pointStates.save(s);
        }

        log(a.getId(), a.getStudentUserId(), a.getClassId(), "start", null,
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
     * 任务型从 task 的 assessment_points 读考察点列表；权重从班级（class）读，不从任务读。
     * 自主练习等权 1.0。
     */
    private List<PointWeight> resolvePoints(Long taskId, Assessment a,
                                            List<String> dimNames, List<String> pointNames) {
        // 任务型：从任务继承考察点列表
        if (taskId != null) {
            AssessmentTask task = assessments.findTask(taskId);
            List<String> points = parseJsonList(task.getAssessmentPoints());
            // 权重从班级读（创建班级时教师设定，0-10整数）
            Map<String, Double> weights = loadClassWeights(a.getClassId());
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
            // 未指定考察点：回退班级配置的考察范围（教师建班时设定的权重），
            // 保证引擎选点能匹配班级题库里的题目，而不是凭空取一个考察点后无题可出。
            List<PointWeight> fromClass = new ArrayList<>();
            for (Map.Entry<String, Double> e : loadClassWeights(a.getClassId()).entrySet()) {
                fromClass.add(new PointWeight(e.getKey(), guessDimension(e.getKey()), e.getValue()));
            }
            if (!fromClass.isEmpty()) return fromClass;
            // 最后兜底：至少保证一个可考的点，避免引擎无可考察点直接收尾。
            result.add(new PointWeight("提示词书写", "提示词工程", 1.0));
        }
        return result;
    }

    /** 从班级表读取考察点权重（JSON map: 考察点名→0-10整数），转成 Double。 */
    @SuppressWarnings("unchecked")
    private Map<String, Double> loadClassWeights(Long classId) {
        if (classId == null) return Map.of();
        try {
            ClassRoom cr = classRoomRepository.findById(classId).orElse(null);
            if (cr == null || cr.getPointWeights() == null || cr.getPointWeights().isBlank()) {
                return Map.of();
            }
            Map<String, Object> raw = mapper.readValue(cr.getPointWeights(), Map.class);
            Map<String, Double> weights = new HashMap<>();
            for (Map.Entry<String, Object> e : raw.entrySet()) {
                if (e.getValue() instanceof Number n) {
                    double w = n.doubleValue();
                    if (w > 0) weights.put(e.getKey(), w);
                }
            }
            return weights;
        } catch (Exception e) {
            return Map.of();
        }
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
                .orElseThrow(() -> new BusinessException("测评不存在", HttpStatus.NOT_FOUND));

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

        // 题量上限（30题硬上限）；教师不再设定题数，终止只看收敛或此上限。
        int answeredCount = assessmentQuestions.findByAssessmentIdOrderBySequenceNo(assessmentId).size();
        if (answeredCount >= MAX_QUESTIONS) {
            return finishResult(assessmentId, "max_questions");
        }

        // 2.3~2.5 选点→选难度→选题。某考察点在所有难度档均无题可出时，
        // 标记该点 removed 并跳到下一个 active 点，直到能出题或 active 列表为空。
        Question q = null;
        AssessmentPointState chosen = null;
        int difficultyLevel = 3;
        double d = 0.6;
        while (q == null) {
            List<AssessmentPointState> activeNow = pointStates.findActiveByAssessmentId(assessmentId);
            if (activeNow.isEmpty()) {
                return finishResult(assessmentId, "all_converged");
            }
            // 第一级：选考察点 f = w·(1-c) + ε
            chosen = pickPoint(activeNow);

            // 第二级：选难度档
            Double currentProfile = findProfileValue(a.getStudentUserId(), a.getClassId(), chosen.getAssessmentPoint());
            difficultyLevel = pickDifficultyLevel(chosen, answeredCount, currentProfile);
            d = difficultyLevel / 5.0;

            // 第三级：选题。目标档优先，再向两侧邻近档扩散（缺档时不会跳到难度1）
            Set<Long> usedIds = answeredIds(assessmentId);
            List<Integer> levelOrder = new ArrayList<>();
            levelOrder.add(difficultyLevel);
            for (int delta = 1; delta <= 4; delta++) {
                int up = difficultyLevel + delta, dn = difficultyLevel - delta;
                if (up <= 5) levelOrder.add(up);
                if (dn >= 1) levelOrder.add(dn);
            }
            for (int lv : levelOrder) {
                q = pickQuestion(a, chosen.getAssessmentPoint(), lv, usedIds);
                if (q != null) { difficultyLevel = a.getTrainingConfig() != null && q.getDifficulty() != null ? q.getDifficulty() : lv; d = difficultyLevel / 5.0; break; }
            }
            if (q == null) {
                // 该点题已穷尽：标记 removed、跳过，继续下一 active 点
                chosen.setStatus("removed");
                pointStates.save(chosen);
                log(assessmentId, a.getStudentUserId(), a.getClassId(), "point_exhausted",
                        chosen.getAssessmentPoint(), "no available question across levels");
            }
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
                .orElseThrow(() -> new BusinessException("题目不存在", HttpStatus.NOT_FOUND));
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
        saveAnswer(aq, answerContent, score, clarity, comment, artifactIdsJson(artifactIds));

        if (!needFollowUp) {
            // 直接更新 θ/c
            updateState(state, r, expectedR, u, signal, d, aq);
            aq.setFollowedUp(false);
            aq.setFollowUpTurns(0);
            aq.setStatus("answered");
            aq.setFinished(true);
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
        double cNew = Math.min(C_MAX, cOld + C_GROWTH * (1 - cOld) * consistency);

        // 计数权重：客观题 0.5，实操/对话 1.0
        double weight = ("SINGLE_CHOICE".equalsIgnoreCase(aq.getType()) || "TRUE_FALSE".equalsIgnoreCase(aq.getType())) ? 0.5 : 1.0;
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
        Long assessmentId = state.getAssessmentId();
        String point = state.getAssessmentPoint();
        String dimension = state.getDimension();
        List<AssessmentQuestion> all = assessmentQuestions.findByAssessmentIdOrderBySequenceNo(assessmentId);

        // 统计该考察点 / 该维度已评分题的有效正确率 r
        List<Double> pointR = new ArrayList<>();
        List<Double> dimR = new ArrayList<>();
        for (AssessmentQuestion q : all) {
            Double r = effectiveR(q);
            if (r == null) continue;
            if (point.equals(q.getPointName())) pointR.add(r);
            if (dimension.equals(q.getDimensionName())) dimR.add(r);
        }

        int cur = currentLevel(state);
        if (pointR.size() >= 2) {
            // 第一级：该点最近 2 题正确率
            double rate = (pointR.get(pointR.size() - 2) + pointR.get(pointR.size() - 1)) / 2.0;
            return adjustByRate(cur, rate);
        } else if (dimR.size() >= 2) {
            // 第二级：该维度所有已考题正确率
            double rate = dimR.stream().mapToDouble(Double::doubleValue).average().orElse(0);
            return adjustByRate(cur, rate);
        } else {
            // 第三级：按画像该点能力值取最接近档；无画像默认 L3
            return profile != null ? nearestLevel(profile) : 3;
        }
    }

    /** 已评分题的有效正确率：追问后取 rFinal，否则 rInitial；未评分返回 null。 */
    private Double effectiveR(AssessmentQuestion q) {
        return q.getRFinal() != null ? q.getRFinal() : q.getRInitial();
    }

    /** 当前难度档：优先取上一题难度，缺省 L3。 */
    private int currentLevel(AssessmentPointState state) {
        if (state.getLastDifficulty() != null) {
            return clampLevel((int) Math.round(state.getLastDifficulty() * 5));
        }
        return 3;
    }

    /** 正确率决定升降档：≥80% 升1档，<50% 降1档，其间维持。 */
    private int adjustByRate(int cur, double rate) {
        if (rate >= 0.8) return clampLevel(cur + 1);
        if (rate < 0.5) return clampLevel(cur - 1);
        return clampLevel(cur);
    }

    /** 画像能力值取最接近难度档（d=level/5）；恰在两档正中时，≥0.45 向上、反之向下。 */
    private int nearestLevel(double profile) {
        double x = profile * 5.0;
        int floor = (int) Math.floor(x);
        if (Math.abs((x - floor) - 0.5) < 1e-9) {
            return clampLevel(profile >= 0.45 ? floor + 1 : floor);
        }
        return clampLevel((int) Math.round(x));
    }

    private int clampLevel(int level) {
        return Math.max(1, Math.min(5, level));
    }

    private Question pickQuestion(Assessment assessment, String pointName, int difficultyLevel, Set<Long> excludeIds) {
        Long classId = assessment.getClassId();
        TrainingConfiguration training = TrainingConfiguration.read(assessment.getTrainingConfig(), mapper);
        // 有组织时只用该组织的有效测试原题；训练变体不得进入正式测评。
        List<Question> pool;
        if (classId != null && classId > 0) {
            List<Long> ids = classQuestions.findByClassIdAndStatus(classId, "active").stream()
                    .map(ClassQuestion::getQuestionId).distinct().toList();
            pool = questions.findAllById(ids).stream().filter(q -> training == null ? QuestionService.isActiveTest(q) : training.accepts(q)).toList();
        } else {
            pool = questions.testList().stream().filter(QuestionService::isActiveTest).toList();
            if (pool.isEmpty()) pool = questions.publicList().stream().filter(QuestionService::isActiveTest).toList();
        }
        // 第一遍：匹配目标难度档 + 考察点
        for (Question q : pool) {
            if (excludeIds.contains(q.getId())) continue;
            if (q.getDifficulty() == null || q.getDifficulty() != difficultyLevel) continue;
            String points = q.getAssessmentPoints();
            if (points == null || !points.contains(pointName)) continue;
            return q;
        }
        // 第二遍：目标难度档没匹配，放宽难度只匹配考察点（就近扩散）
        for (Question q : pool) {
            if (excludeIds.contains(q.getId())) continue;
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
                0, 0.0, false, 0.0, 0, false, null);
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

    // 考察点 → 维度 受控映射（对齐《具体考察点》六维表，逐字一致）
    private static final Map<String, String> POINT_TO_DIMENSION = new HashMap<>();
    static {
        // AI基础认知（7）
        POINT_TO_DIMENSION.put("AI基本概念理解", "AI基础认知");
        POINT_TO_DIMENSION.put("数据影响AI输出的认知", "AI基础认知");
        POINT_TO_DIMENSION.put("AI决策的基本逻辑", "AI基础认知");
        POINT_TO_DIMENSION.put("AI发展历程认知", "AI基础认知");
        POINT_TO_DIMENSION.put("AI能力边界认知", "AI基础认知");
        POINT_TO_DIMENSION.put("AI社会影响认知", "AI基础认知");
        POINT_TO_DIMENSION.put("批判性看待AI", "AI基础认知");
        // 提示词工程（1）
        POINT_TO_DIMENSION.put("提示词书写", "提示词工程");
        // AI工具使用（4，第三层场景不算考察点）
        POINT_TO_DIMENSION.put("工具选型及局限性认知", "AI工具使用");
        POINT_TO_DIMENSION.put("工具使用能力", "AI工具使用");
        POINT_TO_DIMENSION.put("工作流整合", "AI工具使用");
        POINT_TO_DIMENSION.put("智能体编排", "AI工具使用");
        // AI结果评估与优化（2）
        POINT_TO_DIMENSION.put("评估AI结果", "AI结果评估与优化");
        POINT_TO_DIMENSION.put("优化AI结果", "AI结果评估与优化");
        // 人机协同解决问题（1）
        POINT_TO_DIMENSION.put("与AI协作解决问题", "人机协同解决问题");
        // AI伦理与合规（5）
        POINT_TO_DIMENSION.put("隐私保护意识", "AI伦理与合规");
        POINT_TO_DIMENSION.put("合规意识", "AI伦理与合规");
        POINT_TO_DIMENSION.put("偏见及有害内容识别", "AI伦理与合规");
        POINT_TO_DIMENSION.put("版权与知识产权认知", "AI伦理与合规");
        POINT_TO_DIMENSION.put("问责意识", "AI伦理与合规");
    }

    private String guessDimension(String point) {
        String dim = POINT_TO_DIMENSION.get(point);
        if (dim != null) return dim;
        // 理论上不会走到：本场考察点都来自受控词表。未登记的点归到基础认知兜底。
        return "AI基础认知";
    }

    private void log(Long assessmentId, Long studentId, Long classId,
                     String event, String point, String payload) {
        AssessmentEngineLog l = new AssessmentEngineLog();
        l.setAssessmentId(assessmentId); l.setStudentUserId(studentId); l.setClassId(classId);
        l.setEvent(event); l.setAssessmentPoint(point); l.setPayload(payload);
        engineLogs.save(l);
    }

    // ==================== 4. followup-result：追问结果回传 ====================

    public record FollowupTurn(String ask, String answer) {}
    public record FollowupOutcome(String pointName, Double thetaNew, Double confidenceNew,
                                   String pointStatus, boolean finished, NextQuestionResult nextQuestion) {}

    public FollowupOutcome followupResult(Long assessmentId, Long questionId,
                                           List<FollowupTurn> turns, double rFinal,
                                           String endReason, String commentFinal) {
        return followupResult(assessmentId, questionId, turns, rFinal, endReason, commentFinal, true);
    }

    public FollowupOutcome followupResult(Long assessmentId, Long questionId,
                                           List<FollowupTurn> turns, double rFinal,
                                           String endReason, String commentFinal,
                                           boolean persistTurns) {
        AssessmentQuestion aq = assessmentQuestions.findByAssessmentIdAndQuestionId(assessmentId, questionId)
                .orElseThrow(() -> new BusinessException("题目不存在", HttpStatus.NOT_FOUND));
        AssessmentPointState state = pointStates.findByAssessmentIdAndPoint(assessmentId, aq.getPointName())
                .orElseThrow(() -> new BusinessException("考察点状态不存在"));

        // 把追问问答写入消息表
        if (persistTurns && turns != null) {
            int seq = (int) (messages.findByAssessmentIdOrderByCreatedAt(assessmentId).size());
            for (FollowupTurn t : turns) {
                seq++;
                messages.save(new AssessmentMessage(assessmentId, aq.getId(), "ai", t.ask(), seq));
                seq++;
                messages.save(new AssessmentMessage(assessmentId, aq.getId(), "student", t.answer(), seq));
            }
        }

        // 用 rFinal 重算信号并更新状态
        double d = aq.getDifficultyValue() != null ? aq.getDifficultyValue() : 0.6;
        double expectedR = expectedR(state.getTheta(), d);
        double u = 1 - Math.abs(2 * expectedR - 1) + 0.1;
        double signal = (rFinal - expectedR) / u;
        updateState(state, rFinal, expectedR, u, signal, d, aq);

        aq.setFollowedUp(true);
        aq.setFollowUpTurns(turns != null ? turns.size() : 0);
        aq.setStatus("answered");
        aq.setFinished(true);
        aq.setAnsweredAt(java.time.Instant.now());
        assessmentQuestions.save(aq);
        updateAnswerAfterFollowup(aq, turns, rFinal, commentFinal);

        state.setFollowUpCount(state.getFollowUpCount() + 1);
        pointStates.save(state);

        log(assessmentId, 0L, 0L, "followup", state.getAssessmentPoint(),
                "rFinal=" + rFinal + " turns=" + (turns != null ? turns.size() : 0) + " reason=" + endReason);

        // 直接返回下一题（减少一次插件往返）
        NextQuestionResult next = nextQuestion(assessmentId);
        return new FollowupOutcome(state.getAssessmentPoint(), state.getTheta(),
                state.getConfidence(), state.getStatus(), next.finished(), next);
    }

    // ==================== 5. report-data：收尾取数 ====================

    private String artifactIdsJson(List<Long> artifactIds) {
        if (artifactIds == null || artifactIds.isEmpty()) return null;
        try {
            return mapper.writeValueAsString(artifactIds);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private void saveAnswer(AssessmentQuestion aq, String answerContent, int score,
                            String clarity, String comment, String artifactIds) {
        AssessmentAnswer answer = answers.findByAssessmentQuestionId(aq.getId())
                .orElseGet(() -> new AssessmentAnswer(aq.getId(), answerContent));
        answer.setAnswerContent(answerContent);
        answer.setAnswerCount(1);
        answer.setResultStatus("scored");
        answer.setScore((double) score);
        answer.setScoringReason(comment);
        answer.setScoringEvidence(comment);
        answer.setConfidence(1.0);
        answer.setClarity(clarity);
        answer.setArtifactIds(artifactIds);
        answer.setScoredAt(java.time.Instant.now());
        answers.save(answer);
    }

    private void updateAnswerAfterFollowup(AssessmentQuestion aq, List<FollowupTurn> turns,
                                           double rFinal, String commentFinal) {
        AssessmentAnswer answer = answers.findByAssessmentQuestionId(aq.getId())
                .orElseGet(() -> new AssessmentAnswer(aq.getId(), ""));
        answer.setAnswerCount(1 + (turns == null ? 0 : turns.size()));
        answer.setResultStatus("scored");
        answer.setScore(Math.round(rFinal * 10000.0) / 100.0);
        answer.setScoringReason(commentFinal);
        answer.setScoringEvidence(commentFinal);
        answer.setConfidence(1.0);
        answer.setClarity("high");
        answer.setScoredAt(java.time.Instant.now());
        answers.save(answer);
    }

    public record ReportDimension(String name, Double score, Integer questionCount, boolean tested) {}
    public record ReportPoint(String name, String dimension, Double theta, Double confidence,
                               String status, Integer questionCount, Double weight, boolean lit) {}
    public record ReportAnswerRecord(Integer sequenceNo, Long questionId, String type,
                                      Double difficultyValue, Double rInitial, Double rFinal,
                                      boolean followedUp, Integer followUpTurns, String comment) {}
    public record ReportData(Long assessmentId, String status, Double totalScore,
                              String abilityLevel, List<ReportDimension> dimensions,
                              List<ReportPoint> points, List<ReportAnswerRecord> answerRecords,
                              List<String> weakPoints, List<String> strongPoints,
                              boolean finished, String message) {}

    public ReportData reportData(Long assessmentId) {
        Assessment a = assessments.findById(assessmentId)
                .orElseThrow(() -> new BusinessException("测评不存在", HttpStatus.NOT_FOUND));

        // 幂等：已完成直接读库返回（不重复聚合）
        List<AssessmentPointState> states = pointStates.findByAssessmentId(assessmentId);
        boolean alreadyCompleted = "completed".equals(a.getStatus());
        if (states.isEmpty()) throw new BusinessException("测评无考察点状态");

        List<AssessmentQuestion> aqList = assessmentQuestions.findByAssessmentIdOrderBySequenceNo(assessmentId);

        // ===== 乙方案：未测完不出报告 =====
        // 还有 active（未收敛/未剔除）的考察点，且未到题量上限 → 继续出题，不出分
        long remainingActive = states.stream().filter(s -> "active".equals(s.getStatus())).count();
        long answeredQ = aqList.stream().filter(q -> "answered".equals(q.getStatus())).count();
        if (!alreadyCompleted && remainingActive > 0 && answeredQ < MAX_QUESTIONS) {
            List<ReportAnswerRecord> prog = new ArrayList<>();
            for (AssessmentQuestion q : aqList) {
                prog.add(new ReportAnswerRecord(q.getSequenceNo(), q.getQuestionId(), q.getType(),
                        q.getDifficultyValue(), q.getRInitial(), q.getRFinal(),
                        q.isFollowedUp(), q.getFollowUpTurns(), null));
            }
            return new ReportData(assessmentId, "incomplete", null, null,
                    List.of(), List.of(), prog, List.of(), List.of(),
                    false, "尚未测完：还有 " + remainingActive
                    + " 个考察点未收敛，请继续答题（已答 " + answeredQ + "/" + MAX_QUESTIONS + " 题）");
        }

        // 权重快照（任务发布时设定；缺省 1.0）
        Map<String, Double> weightMap = parseWeights(a.getPointWeights());

        // ===== 总分（设计文档 224 行）：totalScore = 100 * Σ(θ·w) / Σw =====
        // 仅纳入本场实际作答过（answer_count>0）的考察点；未测点 θ=0 不稀释均值。
        List<ReportPoint> points = new ArrayList<>();
        List<String> weakPoints = new ArrayList<>();
        List<String> strongPoints = new ArrayList<>();
        Map<String, List<Double>> dimThetas = new LinkedHashMap<>();
        double thetaSum = 0, wSum = 0;
        for (AssessmentPointState s : states) {
            double w = weightMap.getOrDefault(s.getAssessmentPoint(), 1.0);
            boolean tested = s.getAnswerCount() != null && s.getAnswerCount() > 0;
            double pointScore = tested ? 100.0 * s.getTheta() : 0.0;
            boolean lit = tested && pointScore >= 60.0;
            points.add(new ReportPoint(s.getAssessmentPoint(), s.getDimension(),
                    s.getTheta(), s.getConfidence(), s.getStatus(),
                    s.getQuestionCount(), w, lit));
            if (tested) {
                thetaSum += s.getTheta() * w;
                wSum += w;
                dimThetas.computeIfAbsent(s.getDimension(), k -> new ArrayList<>()).add(s.getTheta());
            }
            if (tested && pointScore < 60.0) weakPoints.add(s.getAssessmentPoint());
            if (lit) strongPoints.add(s.getAssessmentPoint());
        }
        Double totalScore = wSum > 0 ? clamp(100.0 * thetaSum / wSum, 0.0, 100.0) : null;

        // 六维分：固定六维都输出。已测维度=维度内已测点 θ 平均×100；未测维度给 0 占位，雷达图不空。
        List<ReportDimension> dims = new ArrayList<>();
        for (String dimName : DIMENSION_ORDER) {
            List<Double> dimThetaList = dimThetas.get(dimName);
            int qc = states.stream()
                    .filter(s -> dimName.equals(s.getDimension()) && s.getAnswerCount() != null && s.getAnswerCount() > 0)
                    .mapToInt(AssessmentPointState::getQuestionCount).sum();
            if (dimThetaList == null || dimThetaList.isEmpty()) {
                dims.add(new ReportDimension(dimName, 0.0, 0, false));
            } else {
                double avgTheta = dimThetaList.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
                dims.add(new ReportDimension(dimName, clamp(100.0 * avgTheta, 0.0, 100.0), qc, true));
            }
        }

        // 答题记录
        List<ReportAnswerRecord> records = new ArrayList<>();
        for (AssessmentQuestion aq : aqList) {
            records.add(new ReportAnswerRecord(aq.getSequenceNo(), aq.getQuestionId(), aq.getType(),
                    aq.getDifficultyValue(), aq.getRInitial(), aq.getRFinal(),
                    aq.isFollowedUp(), aq.getFollowUpTurns(), null));
        }

        // 落库：维度分 + 考察点分 + 更新画像（仅首次完成时）
        if (!alreadyCompleted) {
            for (ReportDimension d : dims) {
                AssessmentDimensionScore ds = new AssessmentDimensionScore();
                ds.setAssessmentId(assessmentId); ds.setClassId(a.getClassId());
                ds.setStudentUserId(a.getStudentUserId());
                ds.setDimension(d.name()); ds.setScore(d.score()); ds.setQuestionCount(d.questionCount());
                dimensionScores.save(ds);
            }
            for (ReportPoint p : points) {
                AssessmentPointScore ps = new AssessmentPointScore();
                ps.setAssessmentId(assessmentId); ps.setClassId(a.getClassId());
                ps.setStudentUserId(a.getStudentUserId());
                ps.setDimension(p.dimension()); ps.setAssessmentPoint(p.name());
                ps.setScore(100.0 * p.theta()); ps.setQuestionCount(p.questionCount());
                pointScores.save(ps);
            }
            updateProfiles(a, states);
        }

        // 标记测评完成
        a.setStatus("completed");
        if (a.getCompletedAt() == null) a.setCompletedAt(java.time.Instant.now());
        a.setTotalScore(totalScore);
        a.setAverageScore(totalScore);
        a.setAbilityLevel(totalScore == null ? null : abilityLevel(totalScore));
        assessments.save(a);

        log(assessmentId, a.getStudentUserId(), a.getClassId(), "finish", null,
                "total=" + (totalScore == null ? "null" : String.format("%.1f", totalScore)));

        return new ReportData(assessmentId, "completed", totalScore, a.getAbilityLevel(),
                dims, points, records, weakPoints, strongPoints, true, null);
    }

    /** 画像增量更新：先衰减历史，再累加本场。 */
    private void updateProfiles(Assessment a, List<AssessmentPointState> states) {
        LocalDate today = LocalDate.now();
        for (AssessmentPointState s : states) {
            StudentPointProfile p = profiles.findByKey(a.getClassId(), a.getStudentUserId(), s.getAssessmentPoint())
                    .orElseGet(() -> {
                        StudentPointProfile np = new StudentPointProfile();
                        np.setClassId(a.getClassId()); np.setStudentUserId(a.getStudentUserId());
                        np.setDimension(s.getDimension()); np.setAssessmentPoint(s.getAssessmentPoint());
                        return np;
                    });
            // 幂等：本场已入账过则跳过
            if (a.getId().equals(p.getLastAssessmentId())) continue;

            // 衰减旧数据（30天半衰期）
            if (p.getLastUpdatedAt() != null) {
                long days = java.time.temporal.ChronoUnit.DAYS.between(p.getLastUpdatedAt(), today);
                double decay = Math.pow(0.5, days / 30.0);
                p.setProfileSum(p.getProfileSum() * decay);
                p.setProfileWeight(p.getProfileWeight() * decay);
            }
            // 累加本场
            p.setProfileSum(p.getProfileSum() + s.getConfidence() * s.getTheta());
            p.setProfileWeight(p.getProfileWeight() + s.getConfidence());
            p.setProfileValue(p.getProfileWeight() > 0 ? p.getProfileSum() / p.getProfileWeight() : 0.0);
            p.setLastUpdatedAt(today);
            p.setLastAssessmentId(a.getId());
            profiles.save(p);
        }
    }

    private ReportData buildReportData(Assessment a, List<AssessmentPointState> states) {
        // 已完成时从数据库读聚合数据（简化：直接返回已有分数）
        return new ReportData(a.getId(), a.getStatus(), a.getTotalScore(), a.getAbilityLevel(),
                List.of(), List.of(), List.of(), List.of(), List.of(),
                "completed".equals(a.getStatus()), null);
    }

    private String abilityLevel(double score) {
        if (score >= 80) return "L4";
        if (score >= 60) return "L3";
        if (score >= 40) return "L2";
        return "L1";
    }

    // ==================== 6. report-text：回存报告文字 ====================

    public record ReportTextRequest(Long assessmentId, String overall,
                                     Map<String, String> dimensions,
                                     List<Map<String, String>> points,
                                     List<String> suggestions) {}

    public void saveReportText(ReportTextRequest req) {
        Assessment a = assessments.findById(req.assessmentId())
                .orElseThrow(() -> new BusinessException("测评不存在", HttpStatus.NOT_FOUND));
        try {
            a.setReportJson(mapper.writeValueAsString(req));
            assessments.save(a);
        } catch (JsonProcessingException e) {
            throw new BusinessException("报告序列化失败");
        }
    }
}
