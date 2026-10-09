package com.huiqiyikang.assessment.controller;
import com.fasterxml.jackson.core.JsonProcessingException; import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.*; import com.huiqiyikang.assessment.service.TaskService;
import com.huiqiyikang.assessment.service.TaskAssignmentService;
import cn.dev33.satoken.stp.StpUtil; import com.huiqiyikang.assessment.common.*; import jakarta.validation.Valid; import jakarta.validation.constraints.*; import org.springframework.web.bind.annotation.*; import java.time.Instant; import java.util.*;
@RestController @RequestMapping("/api") public class AssessmentTaskController { private final TaskService tasks; private final TaskAssignmentService assignments; private final ObjectMapper mapper; public AssessmentTaskController(TaskService t,ObjectMapper m,TaskAssignmentService a){tasks=t;mapper=m;assignments=a;}
 // 教师发布任务时选定考察范围（固定枚举），学生开始该任务时原样继承。
 // 融合 10.8.3：发布走 TaskAssignmentService.publish（请求幂等 requestKey + 截止时间 + 学生名单快照 + 权重快照 + 题库覆盖校验）。
 public record Create(@NotBlank String title,String description,@Min(1) Integer estimatedDuration,@Min(1) Integer questionCount,List<String> dimensions,List<String> assessmentPoints,Instant deadlineAt,String requestKey){}
 @PostMapping("/classes/{classId}/assessment-tasks") public ApiResponse<?> create(@PathVariable Long classId,@Valid @RequestBody Create r){
   ClassRoom c=owned(classId);
   AssessmentTask task=assignments.publish(new TaskAssignmentService.Publish(
     classId,r.title(),r.description(),r.questionCount(),r.dimensions(),r.assessmentPoints(),r.deadlineAt(),r.requestKey()),uid(),null);
   // 兼容保留 estimatedDuration（老前端仍可能传；10.8.3 的发布流程不处理该字段）
   if(r.estimatedDuration()!=null&&task.getEstimatedDuration()==null){task.setEstimatedDuration(r.estimatedDuration());tasks.save(task);}
   return ApiResponse.ok(task);
 }
 private String json(List<String> values){if(values==null||values.isEmpty())return null;try{return mapper.writeValueAsString(values);}catch(JsonProcessingException e){throw new BusinessException("考察范围数据格式错误");}}
 @GetMapping("/classes/{classId}/assessment-tasks") public ApiResponse<?> list(@PathVariable Long classId){
  ClassRoom c=tasks.classroom(classId).orElseThrow(()->new BusinessException("班级不存在"));
  boolean teacher=c.getTeacherUserId().equals(uid());
  boolean student=tasks.members(uid()).stream().anyMatch(m->m.getClassId().equals(classId));
  if(!teacher&&!student)throw new BusinessException("无权访问该班级任务");
  // 学生视图：仅可见分配给自己的任务（小灶/补救任务 targetStudent 过滤，10.8.3 语义）
  return ApiResponse.ok(teacher?assignments.classTasks(classId)
      :assignments.classTasks(classId).stream().filter(t->assignments.assigned(t,uid())).toList());
 }
 @GetMapping("/assessment-tasks/available")
 public ApiResponse<?> available(){List<AssessmentTask> result=new ArrayList<>();for(ClassMember m:tasks.members(uid()))result.addAll(assignments.classTasks(m.getClassId()));return ApiResponse.ok(result.stream().filter(t->!assignments.ended(t)).filter(t->assignments.assigned(t,uid())).toList());}
 private Long uid(){return StpUtil.getLoginIdAsLong();} private ClassRoom owned(Long id){ClassRoom c=tasks.classroom(id).orElseThrow(()->new BusinessException("班级不存在"));if(!c.getTeacherUserId().equals(uid()))throw new BusinessException("无权操作该班级");return c;}
}
