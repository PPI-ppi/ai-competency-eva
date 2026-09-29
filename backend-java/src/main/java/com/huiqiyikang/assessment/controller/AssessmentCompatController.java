package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.entity.AssessmentQuestion;
import com.huiqiyikang.assessment.entity.Question;
import com.huiqiyikang.assessment.mapper.AssessmentQuestionRepository;
import com.huiqiyikang.assessment.service.AssessmentService;
import com.huiqiyikang.assessment.service.EngineService;
import com.huiqiyikang.assessment.service.LlmClient;
import com.huiqiyikang.assessment.service.QuestionService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

/**
 * 前端离散 REST ↔ 后端引擎的桥接层。
 *
 * 前端走 next/answer/select/follow-up/submit 这套离散动作，
 * 这里只做鉴权 + 调 LLM 评分 + 转发到 EngineService，不重写评分决策。
 */
@RestController
@RequestMapping("/api")
public class AssessmentCompatController {

    private final EngineService engine;
    private final LlmClient llm;
    private final AssessmentService assessments;
    private final AssessmentQuestionRepository assessmentQuestions;
    private final QuestionService questions;

    public AssessmentCompatController(EngineService engine, LlmClient llm,
                                      AssessmentService assessments,
                                      AssessmentQuestionRepository assessmentQuestions,
                                      QuestionService questions) {
        this.engine = engine;
        this.llm = llm;
        this.assessments = assessments;
        this.assessmentQuestions = assessmentQuestions;
        this.questions = questions;
    }

    // ==================== 2.1 测评作答流程 ====================

    /** GET /api/assessments/{id}/detail */
    @GetMapping("/assessments/{id}/detail")
    public ApiResponse<?> detail(@PathVariable Long id) {
        Assessment a = owned(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", a.getId());
        data.put("status", a.getStatus());
        data.put("classId", a.getClassId());
        data.put("taskId", a.getTaskId());
        data.put("taskTitle", a.getTaskTitle());
        data.put("questionCount", a.getQuestionCount());
        data.put("createdAt", a.getCreatedAt());
        return ApiResponse.ok(data);
    }

    /** POST /api/assessments/{id}/next */
    @PostMapping("/assessments/{id}/next")
    public ApiResponse<?> next(@PathVariable Long id) {
        owned(id);
        // 幂等初始化考察点状态（如果还没初始化）
        engine.initializeExistingAssessment(id);
        return ApiResponse.ok(engine.nextQuestion(id));
    }

    /** PUT /api/assessments/{id}/questions/{qid}/answer  body: {answer} */
    @PutMapping("/assessments/{id}/questions/{qid}/answer")
    public ApiResponse<?> answer(@PathVariable Long id, @PathVariable Long qid,
                                @RequestBody Map<String, Object> body) {
        owned(id);
        String answer = body == null ? null : str(body.get("answer"));
        return doScore(id, qid, answer, false);
    }

    /** POST /api/assessments/{id}/questions/{qid}/select */
    @PostMapping("/assessments/{id}/questions/{qid}/select")
    public ApiResponse<?> select(@PathVariable Long id, @PathVariable Long qid,
                                 @RequestBody(required = false) Map<String, Object> body) {
        owned(id);
        String answer = body == null ? null : str(body.get("answer"));
        return doScore(id, qid, answer, false);
    }

    /** PUT /api/assessments/{id}/questions/{qid}/final-answer  body: {answer} */
    @PutMapping("/assessments/{id}/questions/{qid}/final-answer")
    public ApiResponse<?> finalAnswer(@PathVariable Long id, @PathVariable Long qid,
                                     @RequestBody Map<String, Object> body) {
        owned(id);
        String answer = body == null ? null : str(body.get("answer"));
        return doScore(id, qid, answer, true);
    }

    /** POST /api/assessments/{id}/questions/{qid}/follow-up */
    @PostMapping("/assessments/{id}/questions/{qid}/follow-up")
    public ApiResponse<?> followUp(@PathVariable Long id, @PathVariable Long qid) {
        owned(id);
        AssessmentQuestion aq = assessmentQuestions
                .findByAssessmentIdAndQuestionId(id, qid)
                .orElseThrow(() -> new BusinessException("题目不存在"));
        Question q = questions.findById(qid).orElseThrow(() -> new BusinessException("题目不存在"));

        LlmClient.QuestionContext qctx = new LlmClient.QuestionContext(
                q.getId(), q.getType(), q.getTitle(), q.getContent(),
                q.getOptions(), q.getAnswer(), q.getRubric());

        // 调 LLM 决定追问（桥接层简化：不传历史，LLM 根据题目和原始回答决定）
        LlmClient.FollowupDecision decision = llm.followup(qctx, "", List.of(), 0);

        if (decision.finished()) {
            // 追问结束，用 final 结果评分
            double rFinal = 0.7;
            List<EngineService.FollowupTurn> turns = decision.turns() == null ? List.of()
                    : decision.turns().stream()
                        .map(t -> new EngineService.FollowupTurn(t.ask(), t.answer()))
                        .toList();
            return ApiResponse.ok(engine.followupResult(id, qid,
                    turns, rFinal, decision.endReason(), "followup_done"));
        }
        // 返回追问问题给前端
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("followUpQuestion", decision.question());
        data.put("assessmentQuestionId", aq.getId());
        return ApiResponse.ok(data);
    }

    /** POST /api/assessments/{id}/submit */
    @PostMapping("/assessments/{id}/submit")
    public ApiResponse<?> submit(@PathVariable Long id) {
        Assessment a = owned(id);
        a.setStatus("completed");
        a.setCompletedAt(Instant.now());
        assessments.save(a);
        return ApiResponse.ok(Map.of("completed", true));
    }

    /** GET /api/assessments/{id}/workspace */
    @GetMapping("/assessments/{id}/workspace")
    public ApiResponse<?> workspace(@PathVariable Long id) {
        owned(id);
        return ApiResponse.ok(Map.of("draft", "", "files", List.of()));
    }

    /** GET /api/assessments/{id}/questions/{qid}/workspace */
    @GetMapping("/assessments/{id}/questions/{qid}/workspace")
    public ApiResponse<?> questionWorkspace(@PathVariable Long id, @PathVariable Long qid) {
        owned(id);
        return ApiResponse.ok(Map.of("draft", "", "files", List.of()));
    }

    /** POST /api/assessment-tasks/{id}/end */
    @PostMapping("/assessment-tasks/{id}/end")
    public ApiResponse<?> endTask(@PathVariable Long id) {
        return ApiResponse.ok(Map.of("ended", true));
    }

    // ==================== 2.2 报告 ====================

    /** GET /api/assessments/results/history */
    @GetMapping("/assessments/results/history")
    public ApiResponse<?> history() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        return ApiResponse.ok(rows);
    }

    /** GET /api/assessments/results/latest?classId= */
    @GetMapping("/assessments/results/latest")
    public ApiResponse<?> latest(@RequestParam(required = false) Long classId) {
        List<Assessment> rows = classId == null
                ? assessments.findByStudentUserIdOrderByCreatedAtDesc(uid())
                : assessments.findByStudentUserIdAndClassIdOrderByCreatedAtDesc(uid(), classId);
        if (rows.isEmpty()) return ApiResponse.ok(null);
        return ApiResponse.ok(rows.get(0));
    }

    /** GET /api/reports */
    @GetMapping("/reports")
    public ApiResponse<?> reports() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        return ApiResponse.ok(rows);
    }

    /** GET /api/reports/{id}/snapshot */
    @GetMapping("/reports/{id}/snapshot")
    public ApiResponse<?> snapshot(@PathVariable Long id) {
        owned(id);
        try {
            return ApiResponse.ok(engine.reportData(id));
        } catch (BusinessException e) {
            return ApiResponse.ok(null);
        }
    }

    /** POST /api/assessments/{id}/learning-advice */
    @PostMapping("/assessments/{id}/learning-advice")
    public ApiResponse<?> learningAdvice(@PathVariable Long id) {
        owned(id);
        EngineService.ReportData data = engine.reportData(id);
        String reportJson;
        try {
            reportJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data);
        } catch (Exception e) {
            reportJson = "{}";
        }
        String advice = llm.report(reportJson);
        return ApiResponse.ok(Map.of("advice", advice, "data", data));
    }

    // ==================== 内部评分逻辑 ====================

    private ApiResponse<?> doScore(Long assessmentId, Long questionId, String answer, boolean isFinal) {
        AssessmentQuestion aq = assessmentQuestions
                .findByAssessmentIdAndQuestionId(assessmentId, questionId)
                .orElseThrow(() -> new BusinessException("题目不存在"));
        Question q = questions.findById(questionId).orElseThrow(() -> new BusinessException("题目不存在"));

        LlmClient.QuestionContext qctx = new LlmClient.QuestionContext(
                q.getId(), q.getType(), q.getTitle(), q.getContent(),
                q.getOptions(), q.getAnswer(), q.getRubric());

        // 客观题自动判分
        if ("SINGLE_CHOICE".equalsIgnoreCase(q.getType()) || "TRUE_FALSE".equalsIgnoreCase(q.getType())) {
            boolean correct = answer != null && q.getAnswer() != null
                    && answer.trim().equalsIgnoreCase(q.getAnswer().trim());
            int score = correct ? 100 : 0;
            double r = correct ? 1.0 : 0.0;
            return ApiResponse.ok(engine.scoreResult(
                    assessmentId, questionId, answer, score, r, "high",
                    correct ? "回答正确" : "回答错误", null, null));
        }

        // 主观题调 LLM 评分
        LlmClient.ScoreResult sr;
        if (isFinal) {
            sr = llm.scoreSubmission(qctx, answer, List.of(), List.of());
        } else {
            sr = llm.score(qctx, answer, List.of());
        }

        int score = sr.score() != null ? sr.score() : 0;
        double r = sr.r() != null ? sr.r() : score / 100.0;
        String clarity = sr.clarity() != null ? sr.clarity() : "medium";
        String comment = sr.comment() != null ? sr.comment() : "";

        return ApiResponse.ok(engine.scoreResult(
                assessmentId, questionId, answer, score, r, clarity, comment, null, null));
    }

    private Assessment owned(Long id) {
        Assessment a = assessments.findById(id).orElseThrow(() -> new BusinessException("测评不存在"));
        if (!a.getStudentUserId().equals(uid()))
            throw new BusinessException("无权访问该测评", HttpStatus.FORBIDDEN);
        return a;
    }

    private Long uid() {
        return StpUtil.getLoginIdAsLong();
    }

    private String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
