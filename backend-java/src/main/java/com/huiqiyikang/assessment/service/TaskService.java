package com.huiqiyikang.assessment.service;
import com.huiqiyikang.assessment.entity.*; import com.huiqiyikang.assessment.mapper.*; import org.springframework.stereotype.Service; import java.util.*;
@Service public class TaskService { final AssessmentTaskRepository tasks; final ClassRoomRepository classes; final ClassQuestionRepository questions; final ClassMemberRepository members; final TeacherRepository teachers;
 public TaskService(AssessmentTaskRepository t,ClassRoomRepository c,ClassQuestionRepository q,ClassMemberRepository m,TeacherRepository tr){tasks=t;classes=c;questions=q;members=m;teachers=tr;} public Optional<AssessmentTask> findById(Long id){return tasks.findById(id);} public AssessmentTask save(AssessmentTask x){return tasks.save(x);} public List<AssessmentTask> byClass(Long id){return tasks.findByClassIdAndStatus(id,"active");} public List<AssessmentTask> findByClassIdAndStatus(Long id,String status){return tasks.findByClassIdAndStatus(id,status);} public List<ClassQuestion> classQuestions(Long id){return questions.findByClassIdAndStatus(id,"active");} public List<ClassMember> members(Long id){return members.findByStudentUserIdAndStatus(id,"active");} public Optional<ClassRoom> classroom(Long id){return classes.findById(id);} public boolean teacher(Long id){return teachers.existsByUserId(id);}
 public List<AssessmentTask> visibleByClass(Long id){return tasks.findVisibleByClassIds(List.of(id));}
 /** 批量取任务，供教师端结果列表一次性装配任务标题与班级。 */
 public List<AssessmentTask> findAllById(java.util.Collection<Long> ids){return tasks.findAllById(ids);}
 /** 只数行数，不再把整个班级题库读出来再 size()。 */
 public long classQuestionCount(Long id){return questions.countActiveTestQuestions(id);}
}
