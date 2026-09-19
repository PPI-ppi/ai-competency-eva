package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;

/**
 * 实操题成果存档：一道题唯一一种成果类型（image/code）一行。
 */
@TableName("assessment_artifacts")
@Getter @Setter @NoArgsConstructor
public class AssessmentArtifact {
    @TableId(type=IdType.AUTO) Long id;
    Long assessmentId; Long assessmentQuestionId; Long studentUserId;
    String artifactType; String fileName; String fileUrl; String codeLanguage;
    String runStatus="pending"; String runResult;
    Instant createdAt=Instant.now();
}
