package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant; import java.time.LocalDate;

/**
 * 学生 × 班级 × 考察点画像：跨测评长期指标，30 天半衰期。
 * profileSum/profileWeight 为增量维护的两个数，profileValue = sum/weight。
 */
@TableName("student_point_profiles")
@Getter @Setter @NoArgsConstructor
public class StudentPointProfile {
    @TableId(type=IdType.AUTO) Long id;
    Long classId; Long studentUserId;
    String dimension; String assessmentPoint;
    Double profileSum=0.0; Double profileWeight=0.0; Double profileValue=0.0;
    LocalDate lastUpdatedAt; Long lastAssessmentId;
    Instant updatedAt=Instant.now();
}
