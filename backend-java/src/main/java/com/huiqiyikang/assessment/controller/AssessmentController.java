package com.huiqiyikang.assessment.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.entity.AssessmentTask;
import com.huiqiyikang.assessment.service.AssessmentAgentService;
import com.huiqiyikang.assessment.service.AssessmentService;
import com.huiqiyikang.assessment.service.ClassRoomService;
import com.huiqiyikang.assessment.service.TaskService;
import cn.dev33.satoken.stp.StpUtil;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 测评的对外入口。
 *
 * Java 只做两件事：建测评数据（带上教师或学生选定的考察范围），以及把测评过程中的
 * 请求原样转发给 Python Agent。发第一道题、换题、写对话记忆、评分、判断结束全部由
 * Agent 决定，Java 不解析 SSE，也不判断"还有没有下一题"。
 */
@RestController
@RequestMapping("/api")
public class AssessmentController {
    private final AssessmentService assessments;
    private final TaskService tasks;
    private final ClassRoomService members;
    private final AssessmentAgentService agent;
    private final ObjectMapper mapper;

    public AssessmentController(AssessmentService assessments, TaskService tasks, ClassRoomService members,
            AssessmentAgentService agent, ObjectMapper mapper) {
        this.assessments = assessments;
        this.tasks = tasks;
        this.members = members;
        this.agent = agent;
        this.mapper = mapper;
    }

    /**
     * 学生自主测评时选择的考察范围与题量。
     *
     * 考察范围不传表示不限制，使用班级全部题目；questionCount 不传或传 0 表示不限题量
     * （一直出到班级题库里没有没用过的题为止）。
     */
    public record StartOptions(List<String> dimensions, List<String> assessmentPoints, Integer questionCount) {}

    /** 自主测评的题量上限：1–50 题；不传按 0（不限）处理。 */
    private int selfQuestionCount(Integer questionCount) {
        if (questionCount == null || questionCount <= 0) return 0;
        if (questionCount > 50) throw new BusinessException("题量最多 50 题");
        return questionCount;
    }

    /**
     * 开始教师布置的测评任务。
     *
     * 只创建一条测评数据并返回它——考察范围继承自任务，题目由 Agent 在对话时决定。
     * 同一个任务一人一次，重复调用返回已有测评（幂等）。
     */
    @PostMapping("/assessment-tasks/{taskId}/start")
    public ApiResponse<?> start(@PathVariable Long taskId) {
        Long uid = uid();
        AssessmentTask task = tasks.findById(taskId).orElseThrow(() -> new BusinessException("测评任务不存在"));
        if (!members.findByClassIdAndStudentUserId(task.getClassId(), uid).map(x -> "active".equals(x.getStatus())).orElse(false))
            throw new BusinessException("不是该班级有效成员");
        // 一人一次：进行中的记录直接复用（断点续做），已完成的拒绝重复参加。
        Optional<Assessment> existing = assessments.findByTaskIdAndStudentUserId(taskId, uid);
        if (existing.isPresent()) {
            Assessment a = existing.get();
            if (!"in_progress".equals(a.getStatus()))
                throw new BusinessException("该测评任务已完成，不能重复参加", HttpStatus.CONFLICT);
            a.setTaskTitle(task.getTitle());
            return ApiResponse.ok(a);
        }
        Assessment a = new Assessment(taskId, task.getClassId(), uid);
        a.setDimensions(task.getDimensions());
        a.setAssessmentPoints(task.getAssessmentPoints());
        // 任务型测评的题量跟随任务，前端进度条按它显示「第 x / y 题」。
        a.setQuestionCount(task.getQuestionCount() == null ? 0 : task.getQuestionCount());
        // 任务已经查出来了，顺手带上标题，前端就不用拿 task_id 当名字显示。
        a.setTaskTitle(task.getTitle());
        return ApiResponse.ok(assessments.save(a));
    }

    /**
     * 开始自主练习测评。
     *
     * 每次都是全新的测评；学生可以带上想考察的维度与考察点，也可以什么都不带。
     */
    @PostMapping("/classes/{classId}/self-assessments/start")
    public ApiResponse<?> startSelf(@PathVariable Long classId, @RequestBody(required = false) StartOptions options) {
        Long uid = uid();
        if (!members.findByClassIdAndStudentUserId(classId, uid).map(x -> "active".equals(x.getStatus())).orElse(false))
            throw new BusinessException("不是该班级有效成员");
        List<String> dimensions = options == null ? null : options.dimensions();
        List<String> points = options == null ? null : options.assessmentPoints();
        try {
            AiTaxonomy.validate(dimensions, points);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(e.getMessage());
        }
        Assessment a = new Assessment(classId, uid);
        a.setDimensions(json(dimensions));
        a.setAssessmentPoints(json(points));
        // 题量由学生自己选；不选就是不限题量，与改造前行为一致。
        a.setQuestionCount(selfQuestionCount(options == null ? null : options.questionCount()));
        return ApiResponse.ok(assessments.save(a));
    }

    /**
     * 我的测评记录。
     *
     * 带 classId 时只返回该班级下的记录（班级隔离）；不传保持原有行为，兼容老前端。
     */
    @GetMapping("/assessments")
    public ApiResponse<?> list(@RequestParam(value = "classId", required = false) Long classId) {
        List<Assessment> rows = classId == null
                ? assessments.findByStudentUserIdOrderByCreatedAtDesc(uid())
                : assessments.findByStudentUserIdAndClassIdOrderByCreatedAtDesc(uid(), classId);
        fillTaskTitles(rows);
        return ApiResponse.ok(rows);
    }

    /**
     * 列表要显示「这是哪个任务」，这里批量补上任务标题。
     *
     * 以前前端只有 task_id，界面上只能写「测评任务 #3」——那是个数据库自增编号，
     * 对学生没有任何意义。标题一次批量取回，与记录条数无关。
     */
    private void fillTaskTitles(List<Assessment> rows) {
        List<Long> taskIds = rows.stream().map(Assessment::getTaskId)
                .filter(Objects::nonNull).distinct().collect(Collectors.toList());
        if (taskIds.isEmpty()) return;
        Map<Long, AssessmentTask> byId = new HashMap<>();
        for (AssessmentTask task : tasks.findAllById(taskIds)) byId.put(task.getId(), task);
        for (Assessment row : rows) {
            AssessmentTask task = row.getTaskId() == null ? null : byId.get(row.getTaskId());
            if (task != null) row.setTaskTitle(task.getTitle());
        }
    }

    @GetMapping("/assessments/{id}")
    public ApiResponse<?> status(@PathVariable Long id) {
        return ApiResponse.ok(owned(id));
    }

    // ------------------------------------------------------------------
    // 下面是测评过程：全部转发给 Python Agent，Java 不解析事件内容
    // ------------------------------------------------------------------

    /** 恢复现场：整场对话消息 + 当前题目。刷新页面用。 */
    @GetMapping("/assessments/{id}/conversation")
    public ApiResponse<?> conversation(@PathVariable Long id) {
        owned(id);
        return ApiResponse.ok(agent.conversation(id, uid()));
    }

    /**
     * 测评中的对话。
     *
     * 前端只调用这一个接口：不带内容表示"开场/继续"，Agent 会给出当前题目；
     * 带内容表示学生的回答，Agent 边流式回复边决定继续问这题、换题还是收尾。
     */
    @PostMapping(value = "/assessments/{id}/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void chat(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body,
            HttpServletResponse response) throws IOException {
        owned(id);
        response.setContentType("text/event-stream;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        OutputStream out = response.getOutputStream();
        Map<String, Object> payload = new LinkedHashMap<>(body == null ? Map.of() : body);
        payload.put("assessment_id", id);
        payload.put("student_user_id", uid());
        try {
            agent.chatStream(id, uid(), payload, out);
        } catch (BusinessException e) {
            // 已经进入流式响应，只能用 SSE 事件把失败告诉前端。
            if (!response.isCommitted()) {
                out.write(("event: error\ndata: " + mapper.writeValueAsString(e.getMessage()) + "\n\n")
                        .getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        }
    }

    /**
     * 纯对话（对话模型窗口）：普通 LLM 对话，只记录不评分、不推进状态机。
     * 正式作答/追问答案必须走 /chat/stream（提交最终方案）。
     */
    @PostMapping(value = "/assessments/{id}/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void plainChat(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body,
            HttpServletResponse response) throws IOException {
        owned(id);
        response.setContentType("text/event-stream;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        OutputStream out = response.getOutputStream();
        String content = body == null ? null : String.valueOf(body.getOrDefault("content", ""));
        try {
            agent.plainChat(id, uid(), content, out);
        } catch (BusinessException e) {
            if (!response.isCommitted()) {
                out.write(("event: error\ndata: " + mapper.writeValueAsString(e.getMessage()) + "\n\n")
                        .getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        }
    }

    /** 确认结束测评：Agent 收尾、算总分、落结果。 */
    @PostMapping("/assessments/{id}/complete")
    public ApiResponse<?> complete(@PathVariable Long id) {
        owned(id);
        return ApiResponse.ok(agent.complete(id, uid()));
    }

    /** 获取结果。 */
    @GetMapping("/assessments/{id}/result")
    public ApiResponse<?> result(@PathVariable Long id) {
        owned(id);
        return ApiResponse.ok(agent.result(id, uid()));
    }

    private String json(List<String> values) {
        if (values == null || values.isEmpty()) return null;
        try {
            return mapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            throw new BusinessException("考察范围数据格式错误");
        }
    }

    private Assessment owned(Long id) {
        Assessment a = assessments.findById(id).orElseThrow(() -> new BusinessException("测评不存在"));
        if (!a.getStudentUserId().equals(uid())) throw new BusinessException("无权访问该测评");
        return a;
    }

    private Long uid() {
        return StpUtil.getLoginIdAsLong();
    }
}
