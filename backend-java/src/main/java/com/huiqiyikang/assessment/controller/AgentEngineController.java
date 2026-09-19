package com.huiqiyikang.assessment.controller;

import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.entity.Question;
import com.huiqiyikang.assessment.service.AssessmentService;
import com.huiqiyikang.assessment.service.QuestionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 百宝箱测评 Agent 的服务端引擎接口。
 *
 * 与现有 /api/assessment/** 的区别：
 *   - 不走 Sa-Token 登录态，靠 X-Agent-Token 服务令牌识别调用方（后续加拦截器）；
 *   - 学生身份通过 X-User-Id 请求头传入，由百宝箱在嵌入前端时注入；
 *   - 测评大脑（出题、评分、追问、报告）在百宝箱工作流里，Java 只做确定性数值计算
 *     与数据落库——当前是最小版本，先把 start 跑通，后续接口逐步补齐。
 */
@RestController
@RequestMapping("/api/agent/engine")
public class AgentEngineController {
    private final AssessmentService assessments;
    private final QuestionService questions;

    public AgentEngineController(AssessmentService assessments, QuestionService questions) {
        this.assessments = assessments;
        this.questions = questions;
    }

    // ---- 请求 / 响应 DTO ----

    public record StartRequest(Long taskId, Long classId) {}

    public record QuestionVO(Long id, String type, String title, String content, String options,
                             String rubric, String assessmentPoints, Integer difficulty) {}

    public record StartResponse(Long assessmentId, String stage, QuestionVO currentQuestion) {}

    // ---- 接口 ----

    /**
     * 开始一场测评。
     *
     * 带 taskId 表示教师布置的任务测评（一人一次，幂等复用进行中的记录）；
     * 不带 taskId 表示自主练习，每次都是全新测评。
     * 当前选题策略是简化版：直接取公开题库第一道题，后续替换为自适应选题算法。
     */
    @PostMapping("/start")
    public ApiResponse<StartResponse> start(@RequestBody(required = false) StartRequest req,
                                             HttpServletRequest httpReq) {
        Long userId = userId(httpReq);

        Assessment a;
        if (req != null && req.taskId() != null) {
            // 任务型：一人一次幂等，进行中的直接复用
            a = assessments.findByTaskIdAndStudentUserId(req.taskId(), userId)
                    .orElseGet(() -> {
                        Assessment na = new Assessment(req.taskId(), req.classId(), userId);
                        na.setQuestionCount(0);
                        return assessments.save(na);
                    });
        } else {
            // 自主型：每次新建
            Long classId = req != null ? req.classId() : null;
            a = new Assessment(classId, userId);
            a.setQuestionCount(0);
            a = assessments.save(a);
        }

        // 简化选题：公开题库第一道，后续替换为自适应引擎
        List<Question> pool = questions.publicList();
        if (pool.isEmpty()) throw new BusinessException("公开题库为空，请先添加题目");
        Question q = pool.get(0);

        return ApiResponse.ok(new StartResponse(a.getId(), "questioning", toVO(q)));
    }

    // ---- 工具方法 ----

    private QuestionVO toVO(Question q) {
        return new QuestionVO(q.getId(), q.getType(), q.getTitle(), q.getContent(),
                q.getOptions(), q.getRubric(), q.getAssessmentPoints(), q.getDifficulty());
    }

    private Long userId(HttpServletRequest req) {
        String header = req.getHeader("X-User-Id");
        if (header == null || header.isBlank())
            throw new BusinessException("缺少 X-User-Id 请求头", HttpStatus.UNAUTHORIZED);
        try {
            return Long.parseLong(header.trim());
        } catch (NumberFormatException e) {
            throw new BusinessException("X-User-Id 必须是数字", HttpStatus.BAD_REQUEST);
        }
    }
}
