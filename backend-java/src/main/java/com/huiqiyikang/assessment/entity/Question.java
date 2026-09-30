package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("questions") @Getter @Setter @NoArgsConstructor
public class Question { @TableId(type=IdType.AUTO) Long id; Long ownerUserId; String type; String title; String content; String options; String answer; String rubric; String tags; String assessmentPoints; String artifactType; String artifactRequirement; Integer difficulty=1; Integer score=0; String visibility="private"; String status="active"; String questionKind="test"; Long sourceQuestionId; Instant createdAt=Instant.now(); Instant updatedAt=Instant.now(); }
