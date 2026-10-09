package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("class_members") @Getter @Setter @NoArgsConstructor
public class ClassMember {
 String trainingAdvice; String trainingAdviceVersion; @TableId(type=IdType.AUTO) Long id; Long classId; Long studentUserId; String status="active"; Instant joinedAt=Instant.now(); Instant leftAt; Instant removedAt; public ClassMember(Long classId,Long studentUserId){this.classId=classId;this.studentUserId=studentUserId;} }
