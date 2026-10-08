package com.huiqiyikang.assessment.controller;
import com.fasterxml.jackson.core.JsonProcessingException; import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.*; import com.huiqiyikang.assessment.service.TaskService;
import cn.dev33.satoken.stp.StpUtil; import com.huiqiyikang.assessment.common.*; import jakarta.validation.Valid; import jakarta.validation.constraints.*; import org.springframework.web.bind.annotation.*; import java.util.*;
@RestController @RequestMapping("/api") public class AssessmentTaskController { private final TaskService tasks; private final ObjectMapper mapper; public AssessmentTaskController(TaskService t,ObjectMapper m){tasks=t;mapper=m;}
 // 教师发布任务时选定考察范围（固定枚举），学生开始该任务时原样继承。
 // 任务只保留一个「介绍」，不再收目标 / 适用对象：那两项从来没有落库，也没在任何页面展示过。
 public record Create(@NotBlank String title,String description,@Min(1) Integer estimatedDuration,@Min(1) Integer questionCount,List<String> dimensions,List<String> assessmentPoints){}
 @PostMapping("/classes/{classId}/assessment-tasks") public ApiResponse<?> create(@PathVariable Long classId,@Valid @RequestBody Create r){ClassRoom c=owned(classId);int count=r.questionCount()==null?10:r.questionCount();if(tasks.classQuestionCount(classId)<count)throw new BusinessException("班级可用题目不足，无法发布任务");try{AiTaxonomy.validate(r.dimensions(),r.assessmentPoints());}catch(IllegalArgumentException e){throw new BusinessException(e.getMessage());}AssessmentTask task=new AssessmentTask(classId,uid(),r.title(),r.description(),r.estimatedDuration(),count);task.setDimensions(json(r.dimensions()));task.setAssessmentPoints(json(r.assessmentPoints()));return ApiResponse.ok(tasks.save(task));}
 private String json(List<String> values){if(values==null||values.isEmpty())return null;try{return mapper.writeValueAsString(values);}catch(JsonProcessingException e){throw new BusinessException("考察范围数据格式错误");}}
 @GetMapping("/classes/{classId}/assessment-tasks") public ApiResponse<?> list(@PathVariable Long classId){
  ClassRoom c=tasks.classroom(classId).orElseThrow(()->new BusinessException("班级不存在"));
  boolean teacher=c.getTeacherUserId().equals(uid());
  boolean student=tasks.members(uid()).stream().anyMatch(m->m.getClassId().equals(classId));
  if(!teacher&&!student)throw new BusinessException("无权访问该班级任务");
  return ApiResponse.ok(teacher?tasks.visibleByClass(classId):tasks.findByClassIdAndStatus(classId,"active"));
 }
 @GetMapping("/assessment-tasks/available")
 public ApiResponse<?> available(){List<AssessmentTask> result=new ArrayList<>();for(ClassMember m:tasks.members(uid()))result.addAll(tasks.findByClassIdAndStatus(m.getClassId(),"active"));return ApiResponse.ok(result);}
 private Long uid(){return StpUtil.getLoginIdAsLong();} private ClassRoom owned(Long id){ClassRoom c=tasks.classroom(id).orElseThrow(()->new BusinessException("班级不存在"));if(!c.getTeacherUserId().equals(uid()))throw new BusinessException("无权操作该班级");return c;}
}
