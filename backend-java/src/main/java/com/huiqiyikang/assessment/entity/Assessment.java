package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("assessments") @Getter @Setter @NoArgsConstructor
/**
 * totalScore 是「所有题目分的平均」（老口径）；averageScore 是「六维分的平均」（2.0 综合分），abilityLevel 由它划档。
 * questionCount 是本次测评的题量上限，0 表示不限（教师任务由任务的题数决定，自主练习由学生选择）。
 * advice 是收尾时生成的学习建议，历史数据为 null。
 */
public class Assessment { @TableId(type=IdType.AUTO) Long id; Long taskId; Long classId; Long studentUserId; String dimensions; String assessmentPoints; String pointWeights; String reportJson; String beforeProfileJson; String reportSnapshotJson; String reportType="ASSESSMENT"; String trainingConfig; Integer questionCount=0; String status="in_progress"; Instant startedAt=Instant.now(); Instant completedAt; Double totalScore; Double averageScore; String abilityLevel; String advice; Instant createdAt=Instant.now(); Instant updatedAt=Instant.now(); /** 不是数据库列：列表接口回给前端看的任务标题，避免界面上出现内部 id。 */ @TableField(exist=false) String taskTitle; @TableField(exist=false) String description; public Assessment(Long task,Long clazz,Long student){taskId=task;classId=clazz;studentUserId=student;} public Assessment(Long clazz,Long student){classId=clazz;studentUserId=student;} }
