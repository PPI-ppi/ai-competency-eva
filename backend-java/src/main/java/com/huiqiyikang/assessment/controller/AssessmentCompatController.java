package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.AssessmentQuestionRepository;
import com.huiqiyikang.assessment.mapper.AssessmentRepository;
import com.huiqiyikang.assessment.mapper.AssessmentTaskRepository;
import com.huiqiyikang.assessment.mapper.ClassRoomRepository;
import com.huiqiyikang.assessment.mapper.ClassQuestionRepository;
import com.huiqiyikang.assessment.service.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 前端离散 REST ↔ 后端引擎的桥接层。
 */
@RestController
@RequestMapping("/api")
public class AssessmentCompatController {

    private final EngineService engine;
    private final LlmClient llm;
    private final AssessmentService assessments;
    private final AssessmentAgentService agent;
    private final AssessmentQuestionRepository assessmentQuestions;
    private final QuestionService questions;
    private final AssessmentRepository assessmentRepo;
    private final ClassRoomRepository classRepo;
    private final ClassQuestionRepository classQuestionRepo;
    private final AssessmentTaskRepository taskRepo;

    public AssessmentCompatController(EngineService engine, LlmClient llm,
                                      AssessmentService assessments,
                                      AssessmentAgentService agent,
                                      AssessmentQuestionRepository assessmentQuestions,
                                      QuestionService questions,
                                      AssessmentRepository assessmentRepo,
                                      ClassRoomRepository classRepo,
                                      ClassQuestionRepository classQuestionRepo,
                                      AssessmentTaskRepository taskRepo) {
        this.engine = engine;
        this.llm = llm;
        this.assessments = assessments;
        this.agent = agent;
        this.assessmentQuestions = assessmentQuestions;
        this.questions = questions;
        this.assessmentRepo = assessmentRepo;
        this.classRepo = classRepo;
        this.classQuestionRepo = classQuestionRepo;
        this.taskRepo = taskRepo;
    }

    // ==================== 2.1 测评作答流程 ====================

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

    @PostMapping("/assessments/{id}/next")
    public ApiResponse<?> next(@PathVariable Long id) {
        owned(id);
        engine.initializeExistingAssessment(id);
        EngineService.NextQuestionResult nq = engine.nextQuestion(id);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("currentQuestion", nq.question());
        data.put("nextQuestion", nq);
        data.put("finished", nq.finished());
        return ApiResponse.ok(data);
    }

    @PutMapping("/assessments/{id}/questions/{qid}/answer")
    public ApiResponse<?> answer(@PathVariable Long id, @PathVariable Long qid,
                                @RequestBody Map<String, Object> body) {
        owned(id);
        return doScore(id, qid, body == null ? null : str(body.get("answer")), false);
    }

    @PostMapping("/assessments/{id}/questions/{qid}/select")
    public ApiResponse<?> select(@PathVariable Long id, @PathVariable Long qid,
                                 @RequestBody(required = false) Map<String, Object> body) {
        owned(id);
        return doScore(id, qid, body == null ? null : str(body.get("answer")), false);
    }

    @PutMapping("/assessments/{id}/questions/{qid}/final-answer")
    public ApiResponse<?> finalAnswer(@PathVariable Long id, @PathVariable Long qid,
                                     @RequestBody Map<String, Object> body) {
        owned(id);
        return doScore(id, qid, body == null ? null : str(body.get("answer")), true);
    }

    @PostMapping("/assessments/{id}/questions/{qid}/follow-up")
    public ApiResponse<?> followUp(@PathVariable Long id, @PathVariable Long qid,
                                   @RequestBody(required = false) Map<String, Object> body) {
        owned(id);
        String studentAnswer = body == null ? null : str(body.get("answer"));
        Question q = questions.findById(qid).orElseThrow(() -> new BusinessException("题目不存在"));

        LlmClient.QuestionContext qctx = new LlmClient.QuestionContext(
                q.getId(), q.getType(), q.getTitle(), q.getContent(),
                q.getOptions(), q.getAnswer(), q.getRubric());

        LlmClient.FollowupDecision decision = llm.followup(qctx, studentAnswer, List.of(), 0);

        Map<String, Object> data = new LinkedHashMap<>();
        if (decision.finished()) {
            double rFinal = 0.7;
            List<EngineService.FollowupTurn> turns = decision.turns() == null ? List.of()
                    : decision.turns().stream()
                        .map(t -> new EngineService.FollowupTurn(t.ask(), t.answer()))
                        .toList();
            engine.followupResult(id, qid, turns, rFinal, decision.endReason(), "followup_done");
            // 追问结束，自动返回下一题
            EngineService.NextQuestionResult nq = engine.nextQuestion(id);
            data.put("currentQuestion", nq.question());
            data.put("nextQuestion", nq);
            data.put("finished", nq.finished());
            data.put("followUpDone", true);
        } else {
            data.put("followUpQuestion", decision.question());
            data.put("needFollowUp", true);
        }
        return ApiResponse.ok(data);
    }

    @PostMapping("/assessments/{id}/submit")
    public ApiResponse<?> submit(@PathVariable Long id) {
        Assessment a = owned(id);
        a.setStatus("completed");
        a.setCompletedAt(Instant.now());
        assessments.save(a);
        return ApiResponse.ok(Map.of("completed", true));
    }

    @GetMapping("/assessments/{id}/workspace")
    public ApiResponse<?> workspace(@PathVariable Long id) {
        owned(id);
        return ApiResponse.ok(Map.of("draft", "", "files", List.of()));
    }

    @GetMapping("/assessments/{id}/questions/{qid}/workspace")
    public ApiResponse<?> questionWorkspace(@PathVariable Long id, @PathVariable Long qid) {
        owned(id);
        return ApiResponse.ok(Map.of("draft", "", "files", List.of()));
    }

    @PostMapping("/assessment-tasks/{id}/end")
    public ApiResponse<?> endTask(@PathVariable Long id) {
        AssessmentTask task = taskRepo.findById(id).orElseThrow(() -> new BusinessException("任务不存在"));
        if (!task.getTeacherUserId().equals(uid()))
            throw new BusinessException("无权操作该任务", HttpStatus.FORBIDDEN);
        if ("active".equals(task.getStatus())) {
            task.setStatus("ended");
            task.setUpdatedAt(Instant.now());
            taskRepo.save(task);
        }
        return ApiResponse.ok(Map.of("ended", true, "status", task.getStatus()));
    }

    @DeleteMapping("/assessment-tasks/{id}")
    public ApiResponse<?> deleteTask(@PathVariable Long id) {
        AssessmentTask task = taskRepo.findById(id).orElseThrow(() -> new BusinessException("任务不存在"));
        if (!task.getTeacherUserId().equals(uid()))
            throw new BusinessException("无权操作该任务", HttpStatus.FORBIDDEN);
        task.setStatus("deleted");
        task.setUpdatedAt(Instant.now());
        taskRepo.save(task);
        return ApiResponse.ok(Map.of("deleted", true));
    }

    // ==================== 2.2 报告 ====================

    @GetMapping("/assessments/results/history")
    public ApiResponse<?> history() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        fillTaskTitles(rows);
        return ApiResponse.ok(rows);
    }

    @GetMapping("/assessments/results/latest")
    public ApiResponse<?> latest(@RequestParam(required = false) Long classId) {
        List<Assessment> rows = classId == null
                ? assessments.findByStudentUserIdOrderByCreatedAtDesc(uid())
                : assessments.findByStudentUserIdAndClassIdOrderByCreatedAtDesc(uid(), classId);
        return ApiResponse.ok(rows.isEmpty() ? null : rows.get(0));
    }

    @GetMapping("/reports")
    public ApiResponse<?> reports() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        fillTaskTitles(rows);
        return ApiResponse.ok(rows);
    }

    @GetMapping("/reports/{id}/snapshot")
    public ApiResponse<?> snapshot(@PathVariable Long id) {
        owned(id);
        try { return ApiResponse.ok(agent.result(id, uid())); }
        catch (BusinessException e) { return ApiResponse.ok(null); }
    }

    @PostMapping("/assessments/{id}/learning-advice")
    public ApiResponse<?> learningAdvice(@PathVariable Long id) {
        owned(id);
        EngineService.ReportData data = engine.reportData(id);
        String reportJson;
        try { reportJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(data); }
        catch (Exception e) { reportJson = "{}"; }
        String advice = llm.report(reportJson);
        return ApiResponse.ok(Map.of("advice", advice, "data", data));
    }

    // ==================== 组织分类题库（测试/训练） ====================

    @GetMapping("/classes/{classId}/question-banks/{bankType}/questions")
    public ApiResponse<?> classifiedQuestions(@PathVariable Long classId, @PathVariable String bankType) {
        teacherOwns(classId);
        String kind = "TRAINING".equalsIgnoreCase(bankType) ? "training" : "test";
        List<ClassQuestion> cqs = classQuestionRepo.findByClassIdAndStatus(classId, "active");
        List<Question> result = cqs.stream()
                .map(cq -> questions.findById(cq.getQuestionId()).orElse(null))
                .filter(q -> q != null && kind.equals(q.getQuestionKind()))
                .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }

    /** v9 前端契约：questionId 走路径传参。 */
    @PostMapping("/classes/{classId}/question-banks/{bankType}/questions/{questionId}")
    public ApiResponse<?> addClassifiedQuestionByPath(@PathVariable Long classId, @PathVariable String bankType,
                                                      @PathVariable Long questionId) {
        return addClassifiedQuestion(classId, bankType, questionId);
    }

    /** 旧契约兼容：body 传 questionId。 */
    @PostMapping("/classes/{classId}/question-banks/{bankType}/questions")
    public ApiResponse<?> addClassifiedQuestion(@PathVariable Long classId, @PathVariable String bankType,
                                                @RequestBody Map<String, Object> body) {
        Long questionId = body == null || body.get("questionId") == null
                ? null : Long.valueOf(body.get("questionId").toString());
        if (questionId == null) throw new BusinessException("缺少questionId");
        return addClassifiedQuestion(classId, bankType, questionId);
    }

    private ApiResponse<?> addClassifiedQuestion(Long classId, String bankType, Long questionId) {
        teacherOwns(classId);
        Question question = questions.findById(questionId)
                .orElseThrow(() -> new BusinessException("题目不存在"));
        if (!question.getOwnerUserId().equals(uid()))
            throw new BusinessException("只能添加自己拥有的题目");
        String kind = "TRAINING".equalsIgnoreCase(bankType) ? "training" : "test";
        if (!kind.equals(question.getQuestionKind()))
            throw new BusinessException("题目类型与题库不匹配：" + bankType);
        ClassQuestion cq = classQuestionRepo.findByClassIdAndQuestionId(classId, questionId).orElse(null);
        if (cq == null) cq = new ClassQuestion(classId, questionId);
        cq.setStatus("active");
        cq.setRemovedAt(null);
        classQuestionRepo.save(cq);
        return ApiResponse.ok(Map.of("added", true, "questionId", questionId));
    }

    /** 分类题库移除题目：软删班级关联。 */
    @DeleteMapping("/classes/{classId}/question-banks/{bankType}/questions/{questionId}")
    public ApiResponse<?> removeClassifiedQuestion(@PathVariable Long classId, @PathVariable String bankType,
                                                   @PathVariable Long questionId) {
        teacherOwns(classId);
        ClassQuestion cq = classQuestionRepo.findByClassIdAndQuestionId(classId, questionId)
                .orElseThrow(() -> new BusinessException("班级中不存在该题目"));
        cq.setStatus("removed");
        cq.setRemovedAt(Instant.now());
        classQuestionRepo.save(cq);
        return ApiResponse.ok(Map.of("removed", true));
    }
    // ==================== 2.6 教师统计/补救 ====================

    @GetMapping("/teacher/assessment-tasks/statistics")
    public ApiResponse<?> taskStatistics() {
        Long tid = uid();
        List<ClassRoom> myClasses = classRepo.findByTeacherUserId(tid);
        Set<Long> classIds = myClasses.stream().map(ClassRoom::getId).collect(Collectors.toSet());
        List<Assessment> allAssessments = assessmentRepo.findAll().stream()
                .filter(a -> classIds.contains(a.getClassId()))
                .collect(Collectors.toList());
        long total = allAssessments.size();
        long completed = allAssessments.stream().filter(a -> "completed".equals(a.getStatus())).count();
        long inProgress = allAssessments.stream().filter(a -> "in_progress".equals(a.getStatus())).count();
        long participants = allAssessments.stream().map(Assessment::getStudentUserId).distinct().count();
        double completionRate = total == 0 ? 0 : (double) completed / total;
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("taskCount", myClasses.size());
        data.put("ongoingCount", inProgress);
        data.put("completedCount", completed);
        data.put("participantCount", participants);
        data.put("completionRate", completionRate);
        return ApiResponse.ok(data);
    }

    @GetMapping("/teacher/students/{studentId}/reports")
    public ApiResponse<?> studentReports(@PathVariable Long studentId) {
        Long tid = uid();
        List<ClassRoom> myClasses = classRepo.findByTeacherUserId(tid);
        Set<Long> classIds = myClasses.stream().map(ClassRoom::getId).collect(Collectors.toSet());
        List<Assessment> rows = assessmentRepo.findByStudentUserId(studentId).stream()
                .filter(a -> classIds.contains(a.getClassId()))
                .collect(Collectors.toList());
        return ApiResponse.ok(rows);
    }

    @PostMapping("/teacher/students/{studentId}/remedial-tasks")
    public ApiResponse<?> createRemedialTask(@PathVariable Long studentId,
                                             @RequestBody Map<String, Object> body) {
        // 简化：直接返回成功，后续建表
        return ApiResponse.ok(Map.of("created", true, "studentId", studentId));
    }

    @GetMapping("/classes/{id}/assessment-results/average")
    public ApiResponse<?> classAverage(@PathVariable Long id) {
        List<Assessment> completed = assessmentRepo.findByClassIdAndStatus(id, "completed");
        double avg = completed.stream()
                .filter(a -> a.getTotalScore() != null)
                .mapToDouble(Assessment::getTotalScore)
                .average().orElse(0.0);
        return ApiResponse.ok(Map.of("averageScore", avg, "count", completed.size()));
    }

    // ==================== 内部评分逻辑 ====================

    private ApiResponse<?> doScore(Long assessmentId, Long questionId, String answer, boolean isFinal) {
        Question q = questions.findById(questionId).orElseThrow(() -> new BusinessException("题目不存在"));

        LlmClient.QuestionContext qctx = new LlmClient.QuestionContext(
                q.getId(), q.getType(), q.getTitle(), q.getContent(),
                q.getOptions(), q.getAnswer(), q.getRubric());

        EngineService.ScoreResultOutcome outcome;

        if ("SINGLE".equalsIgnoreCase(q.getType()) || "SINGLE_CHOICE".equalsIgnoreCase(q.getType()) || "TRUE_FALSE".equalsIgnoreCase(q.getType())) {
            boolean correct = answer != null && q.getAnswer() != null
                    && answer.trim().equalsIgnoreCase(q.getAnswer().trim());
            int score = correct ? 100 : 0;
            double r = correct ? 1.0 : 0.0;
            outcome = engine.scoreResult(assessmentId, questionId, answer, score, r, "high",
                    correct ? "回答正确" : "回答错误", null, null);
        } else {
            LlmClient.ScoreResult sr = isFinal
                    ? llm.scoreSubmission(qctx, answer, List.of(), List.of())
                    : llm.score(qctx, answer, List.of());
            int score = sr.score() != null ? sr.score() : 0;
            double r = sr.r() != null ? sr.r() : score / 100.0;
            String clarity = sr.clarity() != null ? sr.clarity() : "medium";
            String comment = sr.comment() != null ? sr.comment() : "";
            outcome = engine.scoreResult(assessmentId, questionId, answer, score, r, clarity, comment, null, null);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("scoreResult", outcome);
        data.put("needFollowUp", outcome.needFollowUp());
        if (!outcome.needFollowUp()) {
            EngineService.NextQuestionResult nq = engine.nextQuestion(assessmentId);
            data.put("currentQuestion", nq.question());
            data.put("nextQuestion", nq);
            data.put("finished", nq.finished());
        }
        return ApiResponse.ok(data);
    }

    private Assessment owned(Long id) {
        Assessment a = assessments.findById(id).orElseThrow(() -> new BusinessException("测评不存在"));
        if (!a.getStudentUserId().equals(uid()))
            throw new BusinessException("无权访问该测评", HttpStatus.FORBIDDEN);
        return a;
    }

    /** 管理端接口统一要求：当前账号是该班级的教师。 */
    private void teacherOwns(Long classId) {
        ClassRoom classroom = classRepo.findById(classId)
                .orElseThrow(() -> new BusinessException("班级不存在", HttpStatus.NOT_FOUND));
        if (!classroom.getTeacherUserId().equals(uid()))
            throw new BusinessException("无权操作该班级", HttpStatus.FORBIDDEN);
    }

    private Long uid() { return StpUtil.getLoginIdAsLong(); }
    private String str(Object o) { return o == null ? null : String.valueOf(o); }

    /** 列表接口给任务测评填充任务标题（Assessment.taskTitle 为非库列字段，前端报告行展示用）。 */
    private void fillTaskTitles(List<Assessment> rows) {
        List<Long> taskIds = rows.stream().map(Assessment::getTaskId).filter(Objects::nonNull).distinct().toList();
        if (taskIds.isEmpty()) return;
        Map<Long, String> titles = taskRepo.findAllById(taskIds).stream()
                .collect(Collectors.toMap(AssessmentTask::getId, AssessmentTask::getTitle, (a, b) -> a));
        for (Assessment r : rows) {
            if (r.getTaskId() != null) r.setTaskTitle(titles.get(r.getTaskId()));
        }
    }
}
