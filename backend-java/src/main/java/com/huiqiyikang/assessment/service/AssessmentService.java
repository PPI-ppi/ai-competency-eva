package com.huiqiyikang.assessment.service;

import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.stereotype.Service;
import java.util.*;

@Service
public class AssessmentService {
    private final AssessmentRepository assessments; private final AssessmentTaskRepository tasks;
    private final ClassMemberRepository members; private final AssessmentQuestionRepository assessmentQuestions;
    private final AssessmentAnswerRepository answers; private final AssessmentMessageRepository messages;
    private final ClassQuestionRepository classQuestions; private final QuestionRepository questions;
    public AssessmentService(AssessmentRepository a, AssessmentTaskRepository t, ClassMemberRepository m,
            AssessmentQuestionRepository aq, AssessmentAnswerRepository aa, AssessmentMessageRepository am,
            ClassQuestionRepository cq, QuestionRepository q) {
        assessments=a; tasks=t; members=m; assessmentQuestions=aq; answers=aa; messages=am; classQuestions=cq; questions=q;
    }
    public Optional<Assessment> findAssessmentById(Long id){return assessments.findById(id);}
    public Optional<Assessment> findById(Long id){return assessments.findById(id);}
    public Optional<Assessment> lockById(Long id){return Optional.ofNullable(assessments.lockById(id));}
    public List<Assessment> listAssessments(Long uid){return assessments.findByStudentUserIdOrderByCreatedAtDesc(uid);}
    public List<Assessment> findByStudentUserIdOrderByCreatedAtDesc(Long uid){return assessments.findByStudentUserIdOrderByCreatedAtDesc(uid);}
    public List<Assessment> findByStudentUserIdAndClassIdOrderByCreatedAtDesc(Long uid,Long classId){return assessments.findByStudentUserIdAndClassIdOrderByCreatedAtDesc(uid,classId);}
    public Optional<Assessment> findAssessment(Long task,Long uid){return assessments.findByTaskIdAndStudentUserId(task,uid);}
    public Optional<Assessment> findByTaskIdAndStudentUserId(Long task,Long uid){return assessments.findByTaskIdAndStudentUserId(task,uid);}
    public Assessment save(Assessment x){return assessments.save(x);} public AssessmentQuestion save(AssessmentQuestion x){return assessmentQuestions.save(x);}
    public AssessmentAnswer save(AssessmentAnswer x){return answers.save(x);} public AssessmentMessage save(AssessmentMessage x){return messages.save(x);}
    public AssessmentQuestion findQuestion(Long id,Long aid){return assessmentQuestions.findByIdAndAssessmentId(id,aid).orElseThrow();}
    public List<AssessmentQuestion> questions(Long id){return assessmentQuestions.findByAssessmentIdOrderBySequenceNo(id);}
    public List<AssessmentQuestion> findByAssessmentIdOrderBySequenceNo(Long id){return assessmentQuestions.findByAssessmentIdOrderBySequenceNo(id);} public Optional<AssessmentQuestion> findByIdAndAssessmentId(Long id,Long aid){return assessmentQuestions.findByIdAndAssessmentId(id,aid);}
    public Optional<AssessmentAnswer> findAnswer(Long id){return answers.findByAssessmentQuestionId(id);}
    public Optional<AssessmentAnswer> findByAssessmentQuestionId(Long id){return answers.findByAssessmentQuestionId(id);} public List<AssessmentAnswer> findByAssessmentQuestionIdIn(Collection<Long> ids){return answers.findByAssessmentQuestionIdIn(ids);}
    public List<AssessmentAnswer> answers(Collection<Long> ids){return answers.findByAssessmentQuestionIdIn(ids);}
    public List<AssessmentMessage> messages(Long id){return messages.findByAssessmentQuestionIdOrderBySequenceNo(id);}
    public List<AssessmentMessage> findByAssessmentQuestionIdOrderBySequenceNo(Long id){return messages.findByAssessmentQuestionIdOrderBySequenceNo(id);}
    public List<AssessmentMessage> findByAssessmentIdOrderByCreatedAt(Long id){return messages.findByAssessmentIdOrderByCreatedAt(id);}
    public List<ClassQuestion> classQuestions(Long id){return classQuestions.findByClassIdAndStatus(id,"active");}
    public Optional<ClassMember> member(Long cid,Long uid){return members.findByClassIdAndStudentUserId(cid,uid);}
    public Optional<Question> question(Long id){return questions.findById(id);}
    public Optional<AssessmentTask> task(Long id){return tasks.findById(id);}
    public Optional<AssessmentTask> findByTaskId(Long id){return tasks.findById(id);}
    public AssessmentTask findTask(Long id){return tasks.findById(id).orElseThrow();}
    public List<AssessmentQuestion> findAssessmentQuestions(Long id){return assessmentQuestions.findByAssessmentIdOrderBySequenceNo(id);}
    public Optional<AssessmentQuestion> findAssessmentQuestion(Long id,Long aid){return assessmentQuestions.findByIdAndAssessmentId(id,aid);}
    public List<AssessmentMessage> findMessages(Long id){return messages.findByAssessmentQuestionIdOrderBySequenceNo(id);}
    public AssessmentMessage saveMessage(AssessmentMessage x){return messages.save(x);}
    public Optional<AssessmentAnswer> findAnswerByQuestion(Long id){return answers.findByAssessmentQuestionId(id);}
    public List<AssessmentAnswer> findAnswers(Collection<Long> ids){return answers.findByAssessmentQuestionIdIn(ids);}
    public AssessmentAnswer saveAnswer(AssessmentAnswer x){return answers.save(x);}
    public List<ClassQuestion> findClassQuestions(Long id,String status){return classQuestions.findByClassIdAndStatus(id,status);}
    public Optional<ClassMember> findMember(Long c,Long u){return members.findByClassIdAndStudentUserId(c,u);}
    public Optional<Question> findQuestionById(Long id){return questions.findById(id);}
    public AssessmentTask save(AssessmentTask x){return tasks.save(x);}
    public List<Assessment> findAll(){return assessments.findAll();}
    // ---- 批量查询：列表接口一次把材料取齐，替代"每条再查一次"的 N+1 ----
    public List<Assessment> findByTaskIdIn(Collection<Long> taskIds){return assessments.findByTaskIdIn(taskIds);}
    public List<AssessmentQuestion> findAssessmentQuestionsByAssessmentIds(Collection<Long> assessmentIds){return assessmentQuestions.findByAssessmentIdIn(assessmentIds);}
    public List<AssessmentMessage> findMessagesByQuestionIds(Collection<Long> questionIds){return messages.findByAssessmentQuestionIdIn(questionIds);}
}
