package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;

/**
 * 班级 × 题目新鲜度：freshness∈[0,1]，新题=1，抽中后衰减，整场结束后恢复。
 */
@TableName("class_question_freshness")
@Getter @Setter @NoArgsConstructor
public class ClassQuestionFreshness {
    @TableId(type=IdType.AUTO) Long id;
    Long classId; Long questionId;
    Double freshness=1.0; Integer drawCount=0;
    Instant lastDrawnAt; Instant createdAt=Instant.now(); Instant updatedAt=Instant.now();
}
