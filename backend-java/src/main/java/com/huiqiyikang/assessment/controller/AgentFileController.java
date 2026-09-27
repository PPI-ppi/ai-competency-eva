package com.huiqiyikang.assessment.controller;

import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.AssessmentArtifact;
import com.huiqiyikang.assessment.mapper.AssessmentArtifactRepository;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;

/**
 * 实操题成果上传：图片/代码文件存档，沙箱运行结果回传。
 *
 * 存储：文件存服务器本地盘 {storage-path}/{assessmentId}/，DB 记元数据。
 * 访问：通过 Nginx 把 /artifacts/ 映射到 storage-path，前端拿 fileUrl 直接访问。
 */
@RestController
@RequestMapping("/api/agent/files")
public class AgentFileController {

    private final AssessmentArtifactRepository artifacts;

    @Value("${artifact.storage-path:/data/artifacts}")
    private String storagePath;

    @Value("${artifact.public-url-prefix:/artifacts}")
    private String publicUrlPrefix;

    public AgentFileController(AssessmentArtifactRepository artifacts) {
        this.artifacts = artifacts;
    }

    /**
     * 上传实操题成果文件。
     *
     * form-data 参数：
     *   file           上传的文件（必传）
     *   assessmentId   测评 ID（必传）
     *   assessmentQuestionId  发题快照 ID（必传）
     *   artifactType   image / code（必传）
     *   codeLanguage   代码语言（code 时传，如 python）
     */
    @PostMapping
    public ApiResponse<Map<String, Object>> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("assessmentId") Long assessmentId,
            @RequestParam("assessmentQuestionId") Long assessmentQuestionId,
            @RequestParam("artifactType") String artifactType,
            @RequestParam(value = "codeLanguage", required = false) String codeLanguage,
            HttpServletRequest httpReq) {

        Long userId = userId(httpReq);

        if (file.isEmpty()) throw new BusinessException("文件为空");
        String original = file.getOriginalFilename();
        String ext = "";
        if (original != null && original.contains(".")) {
            ext = original.substring(original.lastIndexOf('.'));
        }
        String storedName = UUID.randomUUID() + ext;

        try {
            // 存到磁盘
            Path dir = Paths.get(storagePath, String.valueOf(assessmentId));
            Files.createDirectories(dir);
            Path target = dir.resolve(storedName);
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);

            // 记 DB
            AssessmentArtifact a = new AssessmentArtifact();
            a.setAssessmentId(assessmentId);
            a.setAssessmentQuestionId(assessmentQuestionId);
            a.setStudentUserId(userId);
            a.setArtifactType(artifactType);
            a.setFileName(original);
            a.setFileUrl(publicUrlPrefix + "/" + assessmentId + "/" + storedName);
            a.setCodeLanguage(codeLanguage);
            artifacts.save(a);

            return ApiResponse.ok(Map.of(
                    "artifactId", a.getId(),
                    "fileUrl", a.getFileUrl(),
                    "fileName", original,
                    "runStatus", "pending"));
        } catch (IOException e) {
            throw new BusinessException("文件存储失败: " + e.getMessage());
        }
    }

    /**
     * 回传沙箱运行结果（实操题工具链执行完后调用）。
     *
     * body: { runStatus: "passed"/"failed"/"timeout", runResult: "..." }
     */
    @PutMapping("/{id}/run-result")
    public ApiResponse<Map<String, Object>> runResult(@PathVariable Long id,
                                                      @RequestBody Map<String, String> body) {
        AssessmentArtifact a = artifacts.findById(id)
                .orElseThrow(() -> new BusinessException("成果不存在", HttpStatus.NOT_FOUND));
        a.setRunStatus(body.getOrDefault("runStatus", a.getRunStatus()));
        a.setRunResult(body.get("runResult"));
        artifacts.save(a);
        return ApiResponse.ok(Map.of("artifactId", id, "runStatus", a.getRunStatus()));
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
