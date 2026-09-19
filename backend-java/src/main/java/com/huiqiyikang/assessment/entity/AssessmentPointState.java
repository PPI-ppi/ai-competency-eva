package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;

/**
 * 本场考察点状态表：一次测评 × 一个考察点一行，是自适应引擎的内存镜像。
 * theta=能力值[0,1]，confidence=置信度[0,0.95]，answer_count 为计答题数（客观题0.5/实操对话1.0）。
 */
@TableName("assessment_point_states")
@Getter @Setter @NoArgsConstructor
public class AssessmentPointState {
    @TableId(type=IdType.AUTO) Long id;
    Long assessmentId; Long classId;
    String dimension; String assessmentPoint;
    Double theta=0.0; Double confidence=0.0;
    Double answerCount=0.0; Integer questionCount=0; Integer followUpCount=0;
    String status="active"; Double lastDifficulty;
    Instant createdAt=Instant.now(); Instant updatedAt=Instant.now();
}
