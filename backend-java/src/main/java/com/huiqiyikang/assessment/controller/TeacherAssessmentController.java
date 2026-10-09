package com.huiqiyikang.assessment.controller;
import com.huiqiyikang.assessment.entity.*; import com.huiqiyikang.assessment.service.*;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 教师端测评结果。
 *
 * 名单类接口一律「先按条件取测评，再把学生 / 任务 / 班级 / 题目 / 答案各批量取一次」，
 * 不再对每一条测评重复查库，也不再为了过滤而把整张 assessments 表读进内存。
 */
@RestController @RequestMapping("/api/teacher")
public class TeacherAssessmentController {
    @org.springframework.beans.factory.annotation.Autowired private TaskAssignmentService assignments;
    private final AssessmentService assessments; private final TaskService tasks; private final AssessmentService questions; private final AssessmentService answers; private final ClassRoomService classes; private final AccountService users; private final AccountService teachers;
    public TeacherAssessmentController(AssessmentService a,TaskService t,AssessmentService q,AssessmentService aa,ClassRoomService c,AccountService u,AccountService tr){assessments=a;tasks=t;questions=q;answers=aa;classes=c;users=u;teachers=tr;}

    /** 任务下的完成情况：按任务学生名单（含小灶/补救目标学生）过滤，未开始的学生补 pending 行。 */
    @GetMapping("/assessment-tasks/{taskId}/results")
    public ApiResponse<?> taskResults(@PathVariable Long taskId) {
        AssessmentTask task = ownedTask(taskId);
        List<Long> audience = assignments.audience(task);
        List<Assessment> attempts = assessments.findByTaskIdIn(List.of(task.getId())).stream()
                .filter(a -> audience.contains(a.getStudentUserId())).toList();
        List<Map<String, Object>> result = new ArrayList<>(summaries(attempts, Map.of(task.getId(), task)));
        Set<Long> started = attempts.stream().map(Assessment::getStudentUserId).collect(Collectors.toSet());
        for (User user : users.findAllById(audience.stream().filter(id -> !started.contains(id)).toList())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("studentId", user.getId()); row.put("studentNickname", user.getName());
            row.put("taskId", task.getId()); row.put("status", "pending");
            result.add(row);
        }
        return ApiResponse.ok(result);
    }

    /** 班级下的完成情况：先取班级的 active 任务，再按这批 task_id 取测评。 */
    @GetMapping("/classes/{classId}/results")
    public ApiResponse<?> classResults(@PathVariable Long classId) {
        ClassRoom c = classes.findById(classId).orElseThrow(() -> new BusinessException("班级不存在"));
        if (!c.getTeacherUserId().equals(uid())) throw new BusinessException("无权访问该班级");
        Map<Long, AssessmentTask> taskMap = tasks.findByClassIdAndStatus(classId, "active").stream()
                .collect(Collectors.toMap(AssessmentTask::getId, task -> task));
        return ApiResponse.ok(summaries(assessments.findByTaskIdIn(taskMap.keySet()), taskMap));
    }

    @GetMapping("/assessments/{id}")
    public ApiResponse<?> detail(@PathVariable Long id) {
        Assessment a = assessments.findById(id).orElseThrow(() -> new BusinessException("测评不存在"));
        AssessmentTask task = ownedTask(a.getTaskId());
        List<AssessmentQuestion> qs = questions.findByAssessmentIdOrderBySequenceNo(id);
        List<Long> questionIds = qs.stream().map(AssessmentQuestion::getId).toList();
        Map<Long, AssessmentAnswer> answerMap = answers.findAnswers(questionIds).stream()
                .collect(Collectors.toMap(AssessmentAnswer::getAssessmentQuestionId, x -> x, (first, second) -> first));
        // 逐题对话一次取齐，替代「每道题查一次」
        Map<Long, List<AssessmentMessage>> messagesByQuestion = assessments.findMessagesByQuestionIds(questionIds).stream()
                .collect(Collectors.groupingBy(AssessmentMessage::getAssessmentQuestionId));
        List<Map<String, Object>> questionDetails = qs.stream().map(q -> {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("question", q);
            d.put("messages", transcript(q, messagesByQuestion.get(q.getId())));
            d.put("answer", answerMap.get(q.getId()));
            return d;
        }).toList();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("assessment", a);
        result.put("task", task);
        result.put("classroom", classes.findById(task.getClassId()).orElse(null));
        result.put("student", studentView(users.findById(a.getStudentUserId()).orElse(null)));
        result.put("questions", questionDetails);
        result.put("hasScoringFailure", answerMap.values().stream().anyMatch(x -> "scoring_failed".equals(x.getResultStatus())));
        return ApiResponse.ok(result);
    }

    /**
     * 学生的对外形状。
     *
     * 以前这里直接塞的是 User 实体，Jackson 会把 passwordHash 一起序列化给前端——
     * 教师端页面上用不到，但网络面板里能看到每个学生的 bcrypt 哈希。
     * 需要哪些字段就显式列哪些字段，实体一律不出接口。
     */
    private Map<String, Object> studentView(User student) {
        if (student == null) return null;
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("id", student.getId());
        d.put("name", student.getName());
        d.put("nickname", student.getNickname());
        d.put("username", student.getUsername());
        d.put("account", student.getUsername());
        return d;
    }

    /**
     * 一道题的完整对话，第一句一定是题干。
     *
     * 新数据在发题时就把题干写进了消息表；改造前的历史数据没有这条消息，
     * 前端又只渲染消息列表，于是题干会整条消失。这里按题目快照补一条，
     * 顺序、字段名都与真实消息一致，前端不需要再针对性兼容。
     */
    private List<Object> transcript(AssessmentQuestion question, List<AssessmentMessage> rows) {
        List<AssessmentMessage> messages = rows == null ? List.of() : rows;
        List<Object> all = new ArrayList<>(messages.size() + 1);
        boolean hasPrompt = !messages.isEmpty() && "ai".equals(messages.get(0).getSenderType());
        if (!hasPrompt) {
            Map<String, Object> prompt = new LinkedHashMap<>();
            prompt.put("id", "q-" + question.getId());
            prompt.put("assessmentQuestionId", question.getId());
            prompt.put("senderType", "ai");
            prompt.put("content", question.getContentSnapshot());
            prompt.put("sequenceNo", 0);
            prompt.put("createdAt", question.getSentAt());
            all.add(prompt);
        }
        all.addAll(messages);
        return all;
    }

    /**
     * 把一整份名单装配出来：学生、班级、题目、答案各一次批量查询。
     *
     * 改造前每条测评要跑 5 条 SQL，一个班 50 人就是 250+ 条；现在与名单长度无关。
     */
    private List<Map<String, Object>> summaries(List<Assessment> list, Map<Long, AssessmentTask> taskMap) {
        if (list.isEmpty()) return List.of();
        Map<Long, User> studentMap = users
                .findAllById(list.stream().map(Assessment::getStudentUserId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, x -> x));
        Map<Long, ClassRoom> classMap = classes
                .findAllById(taskMap.values().stream().map(AssessmentTask::getClassId)
                        .filter(Objects::nonNull).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(ClassRoom::getId, x -> x));
        Map<Long, List<AssessmentQuestion>> questionsByAssessment = questions
                .findAssessmentQuestionsByAssessmentIds(list.stream().map(Assessment::getId).collect(Collectors.toSet()))
                .stream().collect(Collectors.groupingBy(AssessmentQuestion::getAssessmentId));
        List<Long> questionIds = questionsByAssessment.values().stream()
                .flatMap(List::stream).map(AssessmentQuestion::getId).toList();
        Map<Long, AssessmentAnswer> answerMap = answers.findAnswers(questionIds).stream()
                .collect(Collectors.toMap(AssessmentAnswer::getAssessmentQuestionId, x -> x, (first, second) -> first));
        return list.stream().map(a -> summary(
                a,
                taskMap.get(a.getTaskId()),
                studentMap.get(a.getStudentUserId()),
                classMap,
                questionsByAssessment.getOrDefault(a.getId(), List.of()),
                answerMap)).toList();
    }

    /** 纯内存组装，不再访问数据库。 */
    private Map<String, Object> summary(Assessment a, AssessmentTask task, User student, Map<Long, ClassRoom> classMap,
            List<AssessmentQuestion> qs, Map<Long, AssessmentAnswer> answerMap) {
        ClassRoom classroom = task == null ? null : classMap.get(task.getClassId());
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("assessmentId", a.getId());
        r.put("taskId", a.getTaskId());
        r.put("classId", a.getClassId());
        r.put("className", classroom == null ? null : classroom.getName());
        r.put("taskTitle", task == null ? null : task.getTitle());
        r.put("studentId", a.getStudentUserId());
        r.put("studentName", student == null ? null : student.getName());
        r.put("studentNickname", student == null ? null : student.getNickname());
        r.put("studentAccount", student == null ? null : student.getUsername());
        r.put("status", a.getStatus());
        r.put("startedAt", a.getStartedAt());
        r.put("completedAt", a.getCompletedAt());
        r.put("totalScore", a.getTotalScore());
        r.put("averageScore", a.getAverageScore());
        r.put("abilityLevel", a.getAbilityLevel());
        r.put("completedQuestionCount", qs.stream().filter(q -> "answered".equals(q.getStatus())).count());
        r.put("questionCount", a.getQuestionCount() != null && a.getQuestionCount() > 0
                ? a.getQuestionCount() : (task == null ? qs.size() : task.getQuestionCount()));
        r.put("hasScoringFailure", qs.stream().map(q -> answerMap.get(q.getId()))
                .anyMatch(x -> x != null && "scoring_failed".equals(x.getResultStatus())));
        return r;
    }

    private AssessmentTask ownedTask(Long id) {
        if (!teachers.existsByUserId(uid())) throw new BusinessException("当前账号不是教师");
        // 自主练习测评的 task_id 是 NULL：以前会带着 null 去 findById，
        // 抛的是未捕获异常（500），这里明确说清楚是「没有任务」。
        if (id == null) throw new BusinessException("该测评不是任务型测评，无法查看", HttpStatus.NOT_FOUND);
        AssessmentTask task = tasks.findById(id).orElseThrow(() -> new BusinessException("测评任务不存在"));
        if (!task.getTeacherUserId().equals(uid())) throw new BusinessException("无权访问该测评任务");
        return task;
    }

    private Long uid(){return StpUtil.getLoginIdAsLong();}
}
