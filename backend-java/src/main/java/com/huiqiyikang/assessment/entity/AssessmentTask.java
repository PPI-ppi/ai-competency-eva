package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("assessment_tasks")
@Getter
@Setter @NoArgsConstructor
public class AssessmentTask { @TableId(type=IdType.AUTO) Long id; Long classId; Long teacherUserId; String title; String description; Integer estimatedDuration; Integer questionCount=10; String dimensions; String assessmentPoints; String pointWeights; String status="active"; Instant createdAt=Instant.now(); Instant updatedAt=Instant.now(); public AssessmentTask(Long c,Long t,String title,String description,Integer duration,Integer count){classId=c;teacherUserId=t;this.title=title;this.description=description;estimatedDuration=duration;questionCount=count==null?10:count;} }
