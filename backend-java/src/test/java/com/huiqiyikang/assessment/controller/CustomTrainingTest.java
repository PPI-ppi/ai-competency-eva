package com.huiqiyikang.assessment.controller;
import cn.dev33.satoken.stp.StpUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.service.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomTrainingTest {
    final AssessmentService assessments=mock(AssessmentService.class);
    final ClassRoomService members=mock(ClassRoomService.class);
    final ObjectMapper mapper=new ObjectMapper();
    final AssessmentController controller=new AssessmentController(assessments,mock(TaskService.class),members,mock(AssessmentAgentService.class),mapper);
    AssessmentController.TrainingRequest request(Integer difficulty) {return new AssessmentController.TrainingRequest(99L,List.of("提示词工程"),List.of("提示词书写"),List.of("DIALOGUE"),difficulty,5);}
    void ready(String kind) {
        var member=new ClassMember();member.setStatus("active");
        when(members.findByClassIdAndStudentUserId(99L,1L)).thenReturn(Optional.of(member));
        var q=new Question();q.setId(7L);q.setQuestionKind(kind);q.setType("DIALOGUE");q.setDifficulty(3);q.setAssessmentPoints("[\"提示词书写\"]");
        when(assessments.classQuestions(99L)).thenReturn(List.of(new ClassQuestion(99L,7L)));
        when(assessments.question(7L)).thenReturn(Optional.of(q));
        when(assessments.save(any(Assessment.class))).thenAnswer(call->call.getArgument(0));
    }
    @Test void savesScopeAndConfigurationForResuming() throws Exception {
        ready("training");try(var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            var result=(Assessment)controller.startTraining(request(3)).data();
            assertNull(result.getTaskId());assertEquals(99L,result.getClassId());assertEquals(5,result.getQuestionCount());
            assertEquals(List.of("提示词书写"),mapper.readValue(result.getAssessmentPoints(),List.class));
            assertEquals(3,TrainingConfiguration.read(result.getTrainingConfig(),mapper).difficulty());
        }
    }
    @Test void rejectsNonmembersBeforeCreatingRecord() {
        try(var auth=mockStatic(StpUtil.class)) {auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertThrows(BusinessException.class,()->controller.startTraining(request(null)));verify(assessments,never()).save(any(Assessment.class));}
    }
    @Test void rejectsOriginalOrMissingDifficultyWithoutCreatingEmptySession() {
        ready("test");try(var auth=mockStatic(StpUtil.class)) {auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertThrows(BusinessException.class,()->controller.startTraining(request(null)));verify(assessments,never()).save(any(Assessment.class));}
        ready("training");try(var auth=mockStatic(StpUtil.class)) {auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertThrows(BusinessException.class,()->controller.startTraining(request(5)));verify(assessments,never()).save(any(Assessment.class));}
    }
    @Test void rejectsInvalidDifficultyAndModes() {
        ready("training");try(var auth=mockStatic(StpUtil.class)) {auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertThrows(BusinessException.class,()->controller.startTraining(request(6)));
            var invalid=new AssessmentController.TrainingRequest(99L,List.of("提示词工程"),List.of("提示词书写"),List.of("INVALID"),null,5);
            assertThrows(BusinessException.class,()->controller.startTraining(invalid));verify(assessments,never()).save(any(Assessment.class));}
    }
}
