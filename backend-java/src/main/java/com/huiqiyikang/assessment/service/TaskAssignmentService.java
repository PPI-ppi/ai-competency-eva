package com.huiqiyikang.assessment.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

/** Persistent task audiences shared by publication, student access and statistics. */
@Service
public class TaskAssignmentService {
    private final AssessmentTaskRepository tasks;
    private final ClassRoomRepository classes;
    private final ClassMemberRepository members;
    private final ClassQuestionRepository links;
    private final QuestionRepository questions;
    private final AssessmentRepository assessments;
    private final ObjectMapper json;
    public TaskAssignmentService(AssessmentTaskRepository t,ClassRoomRepository c,ClassMemberRepository m,
        ClassQuestionRepository l,QuestionRepository q,AssessmentRepository a,ObjectMapper j){tasks=t;classes=c;members=m;links=l;questions=q;assessments=a;json=j;}
    public record Publish(Long classId,String title,String description,Integer questionCount,
        List<String> dimensions,List<String> assessmentPoints,Instant deadlineAt,String requestKey) {}
    public ClassRoom owned(Long classId,Long teacherId){
        ClassRoom c=classes.findById(classId).orElseThrow(()->new BusinessException("组织不存在"));
        if(c.getPersonalOwnerId()!=null||!Objects.equals(c.getTeacherUserId(),teacherId))throw new BusinessException("无权管理该组织",HttpStatus.FORBIDDEN);
        return c;
    }
    @Transactional
    public AssessmentTask publish(Publish r,Long teacherId,Long studentId){
        owned(r.classId(),teacherId);
        // Serialize publication/start per organization; retries reuse a stable request key.
        classes.selectOne(new QueryWrapper<ClassRoom>().eq("id",r.classId()).last("FOR UPDATE"));
        if(r.requestKey()!=null&&!r.requestKey().isBlank()){
            if(r.requestKey().length()>100)throw new BusinessException("请求标识过长");
            AssessmentTask previous=tasks.selectOne(new QueryWrapper<AssessmentTask>().eq("teacher_user_id",teacherId).eq("request_key",r.requestKey()));
            if(previous!=null){
                if(!Objects.equals(previous.getClassId(),r.classId())||!Objects.equals(previous.getTargetStudentId(),studentId))throw new BusinessException("请求标识已用于其他任务");
                return previous;
            }
        }
        if(r.title()==null||r.title().isBlank()||r.title().length()>200)throw new BusinessException("请填写不超过200字的任务名称");
        int count=r.questionCount()==null?10:r.questionCount();
        if(count<1||count>30)throw new BusinessException("题目数量须为1至30");
        if(r.dimensions()==null||r.dimensions().isEmpty()||r.assessmentPoints()==null||r.assessmentPoints().isEmpty())throw new BusinessException("请选择能力维度和考察点");
        try{AiTaxonomy.validate(r.dimensions(),r.assessmentPoints());}catch(IllegalArgumentException e){throw new BusinessException(e.getMessage());}
        if(r.deadlineAt()!=null&&!r.deadlineAt().isAfter(Instant.now()))throw new BusinessException("截止时间须晚于当前时间");
        List<Long> audience=members.findByClassIdAndStatus(r.classId(),"active").stream().map(ClassMember::getStudentUserId).distinct().toList();
        if(studentId!=null){if(!audience.contains(studentId))throw new BusinessException("学生已不在该组织");audience=List.of(studentId);}
        if(audience.isEmpty())throw new BusinessException("组织暂无有效学生，无法发布任务");
        Set<Long> ids=new HashSet<>();for(ClassQuestion l:links.findByClassIdAndStatus(r.classId(),"active"))ids.add(l.getQuestionId());
        List<Question> pool=ids.isEmpty()?List.of():questions.findAllById(ids).stream().filter(q->"active".equals(q.getStatus())).toList();
        List<Question> matching=pool.stream().filter(q->strings(q.getAssessmentPoints()).stream().anyMatch(r.assessmentPoints()::contains)).toList();
        if(matching.size()<count)throw new BusinessException("组织题库中符合考察范围的题目不足，需要"+count+"题，目前有"+matching.size()+"题");
        for(String point:r.assessmentPoints())if(matching.stream().noneMatch(q->strings(q.getAssessmentPoints()).contains(point)))throw new BusinessException("组织题库缺少考察点："+point);
        AssessmentTask task=new AssessmentTask(r.classId(),teacherId,r.title().trim(),r.description(),null,count);
        task.setTaskType(studentId==null?"CLASS":"REMEDIAL");task.setTargetStudentId(studentId);task.setTargetStudentIds(encode(audience));
        task.setDimensions(encode(r.dimensions()));task.setAssessmentPoints(encode(r.assessmentPoints()));task.setDeadlineAt(r.deadlineAt());task.setRequestKey(r.requestKey());
        task.setPointWeights(classes.findById(r.classId()).map(ClassRoom::getPointWeights).orElse(null));
        return tasks.save(task);
    }
    public List<Long> audience(AssessmentTask task){
        if(task.getTargetStudentId()!=null)return List.of(task.getTargetStudentId());
        if(task.getTargetStudentIds()!=null)try{return json.readValue(task.getTargetStudentIds(),new TypeReference<List<Long>>(){});}catch(Exception e){throw new BusinessException("任务学生名单数据异常");}
        // Only unmigrated legacy tasks lack a snapshot.
        return members.findByClassIdAndStatus(task.getClassId(),"active").stream().map(ClassMember::getStudentUserId).distinct().toList();
    }
    public boolean assigned(AssessmentTask task,Long studentId){return audience(task).contains(studentId);}
    public AssessmentTask lockStart(Long taskId){return tasks.selectOne(new QueryWrapper<AssessmentTask>().eq("id",taskId).last("FOR UPDATE"));}
    public void checkStudent(AssessmentTask task,Long studentId){
        if(!members.findByClassIdAndStudentUserId(task.getClassId(),studentId).map(m->"active".equals(m.getStatus())).orElse(false)||!assigned(task,studentId))throw new BusinessException("无权参与该任务",HttpStatus.FORBIDDEN);
        if("deleted".equals(task.getStatus()))throw new BusinessException("任务已删除");
    }
    public boolean ended(AssessmentTask task){return !"active".equals(task.getStatus())||task.getDeadlineAt()!=null&&!task.getDeadlineAt().isAfter(Instant.now());}
    public List<AssessmentTask> classTasks(Long classId){return tasks.selectList(new QueryWrapper<AssessmentTask>().eq("class_id",classId).ne("status","deleted").orderByDesc("created_at"));}
    public Map<String,Object> statistics(List<AssessmentTask> list){
        List<Assessment> rows=assessments.findByTaskIdIn(list.stream().map(AssessmentTask::getId).toList());
        long participants=0,completed=0;double rate=0;
        for(AssessmentTask task:list){Set<Long> targets=new HashSet<>(audience(task));Set<Long> started=new HashSet<>(),done=new HashSet<>();
            for(Assessment a:rows)if(Objects.equals(a.getTaskId(),task.getId())&&targets.contains(a.getStudentUserId())){
                started.add(a.getStudentUserId());if(AssessmentRepository.COMPLETED_STATUSES.contains(a.getStatus()))done.add(a.getStudentUserId());
            }
            participants+=started.size();completed+=done.size();rate+=targets.isEmpty()?0:100.0*done.size()/targets.size();
        }
        Map<String,Object> r=new LinkedHashMap<>();r.put("publishedCount",list.size());r.put("activeCount",list.stream().filter(t->!ended(t)).count());r.put("participantCount",participants);r.put("completedCount",completed);r.put("averageCompletionRate",list.isEmpty()?null:Math.round(rate/list.size()*100)/100.0);return r;
    }
    public List<Map<String,Object>> available(Long studentId){
        List<Map<String,Object>> result=new ArrayList<>();
        for(ClassMember m:members.findByStudentUserIdAndStatus(studentId,"active"))for(AssessmentTask task:classTasks(m.getClassId()))if(assigned(task,studentId)){
            Map<String,Object> r=new LinkedHashMap<>();r.put("id",task.getId());r.put("classId",task.getClassId());r.put("title",task.getTitle());r.put("description",task.getDescription());r.put("taskType",task.getTaskType());r.put("questionCount",task.getQuestionCount());r.put("deadlineAt",task.getDeadlineAt());r.put("status",ended(task)?"ended":"active");
            assessments.findByTaskIdAndStudentUserId(task.getId(),studentId).ifPresent(a->{r.put("assessmentId",a.getId());r.put("assessmentStatus",a.getStatus());});result.add(r);
        }
        return result;
    }
    private List<String> strings(String value){try{return json.readValue(value,new TypeReference<List<String>>(){});}catch(Exception e){return List.of();}}
    private String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new BusinessException("任务数据格式错误");}}
}
