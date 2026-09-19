package com.huiqiyikang.assessment.controller;

import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.service.EngineService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 百宝箱测评 Agent 的服务端引擎接口（v1：start / next-question / score-result）。
 *
 * 鉴权：AuthInterceptor 已放行 /api/agent/**，此处用 X-User-Id 识别学生。
 * 服务令牌（X-Agent-Token）第二阶段加 AgentTokenInterceptor 统一校验。
 */
@RestController
@RequestMapping("/api/agent/engine")
public class AgentEngineController {
    private final EngineService engine;

    public AgentEngineController(EngineService engine) {
        this.engine = engine;
    }

    // ==================== DTO ====================

    public record StartRequest(Long taskId, Long classId,
                               List<String> dimensionNames, List<String> pointNames) {}

    public record NextQuestionRequest(Long assessmentId) {}

    public record ScoreResultRequest(Long assessmentId, Long questionId,
                                      String answerContent, Integer score, Double r,
                                      String clarity, String comment,
                                      List<Map<String, Object>> messages,
                                      List<Long> artifactIds) {}

    // ==================== 接口 ====================

    /** 创建/恢复测评，初始化考察点状态与权重。 */
    @PostMapping("/start")
    public ApiResponse<EngineService.StartResult> start(@RequestBody(required = false) StartRequest req,
                                                         HttpServletRequest httpReq) {
        Long userId = userId(httpReq);
        EngineService.StartResult r = engine.start(
                req != null ? req.taskId() : null,
                req != null ? req.classId() : null,
                userId,
                req != null ? req.dimensionNames() : null,
                req != null ? req.pointNames() : null);
        return ApiResponse.ok(r);
    }

    /** 三级选题：返回下一题或结束。 */
    @PostMapping("/next-question")
    public ApiResponse<EngineService.NextQuestionResult> nextQuestion(@RequestBody NextQuestionRequest req) {
        return ApiResponse.ok(engine.nextQuestion(req.assessmentId()));
    }

    /** 评分回传：计算信号、更新 θ/c、判断是否追问。 */
    @PostMapping("/score-result")
    public ApiResponse<EngineService.ScoreResultOutcome> scoreResult(@RequestBody ScoreResultRequest req) {
        double rVal = req.r() != null ? req.r() : (req.score() != null ? req.score() / 100.0 : 0.0);
        int scoreVal = req.score() != null ? req.score() : (int) Math.round(rVal * 100);
        return ApiResponse.ok(engine.scoreResult(
                req.assessmentId(), req.questionId(), req.answerContent(),
                scoreVal, rVal, req.clarity(), req.comment(),
                req.messages(), req.artifactIds()));
    }

    // ---- 追问结果回传 ----
    public record FollowupResultRequest(Long assessmentId, Long questionId,
                                         List<Map<String, String>> turns,
                                         Double rFinal, Integer scoreFinal,
                                         String endReason, String commentFinal) {}

    @PostMapping("/followup-result")
    public ApiResponse<EngineService.FollowupOutcome> followupResult(@RequestBody FollowupResultRequest req) {
        List<EngineService.FollowupTurn> turns = req.turns() == null ? List.of()
                : req.turns().stream()
                .map(m -> new EngineService.FollowupTurn(m.get("ask"), m.get("answer")))
                .toList();
        double rFinal = req.rFinal() != null ? req.rFinal()
                : (req.scoreFinal() != null ? req.scoreFinal() / 100.0 : 0.0);
        return ApiResponse.ok(engine.followupResult(
                req.assessmentId(), req.questionId(), turns, rFinal,
                req.endReason(), req.commentFinal()));
    }

    // ---- 收尾取数 ----
    @GetMapping("/report-data")
    public ApiResponse<EngineService.ReportData> reportData(@RequestParam Long assessmentId) {
        return ApiResponse.ok(engine.reportData(assessmentId));
    }

    // ---- 回存报告文字 ----
    @PostMapping("/report-text")
    public ApiResponse<Map<String, Boolean>> reportText(@RequestBody EngineService.ReportTextRequest req) {
        engine.saveReportText(req);
        return ApiResponse.ok(Map.of("saved", true));
    }

    // ==================== 工具 ====================

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
