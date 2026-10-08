package com.huiqiyikang.assessment.controller;
import cn.dev33.satoken.stp.StpUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.*;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.service.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class OrganizationQuestionBankTest {
    final ClassRoomService classes=mock(ClassRoomService.class);
    final QuestionService questions=mock(QuestionService.class);
    final AccountService accounts=mock(AccountService.class);
    final TrainingQuestionService training=mock(TrainingQuestionService.class);
    final ClassRoomController controller=new ClassRoomController(classes,classes,classes,classes,questions,
        accounts,accounts,mock(AbilityService.class),new ObjectMapper(),mock(RateLimiter.class),training);
    void owned() {var c=new ClassRoom();c.setTeacherUserId(1L);when(classes.findById(99L)).thenReturn(Optional.of(c));}
    Question q(long id,String kind,String status) {var q=new Question();q.setId(id);q.setOwnerUserId(1L);q.setQuestionKind(kind);q.setStatus(status);return q;}
    @Test void legacyTestListExcludesTrainingAndOfflineQuestions() {
        owned();when(classes.findQuestions(99L,"active")).thenReturn(List.of(new ClassQuestion(99L,7L),new ClassQuestion(99L,8L),new ClassQuestion(99L,9L)));
        var original=q(7,"test","active");when(questions.findAllById(anyCollection())).thenReturn(List.of(original,q(8,"training","active"),q(9,"test","offline")));
        try(var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertEquals(List.of(original),controller.classQuestions(99L).data());
        }
    }
    @Test void cannotAddTrainingVariantAsTestOriginal() {
        owned();when(questions.findById(8L)).thenReturn(Optional.of(q(8,"training","active")));
        try(var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            assertThrows(BusinessException.class,()->controller.addQuestion(99L,8L));
            verifyNoInteractions(training);verify(classes,never()).save(any(ClassQuestion.class));
        }
    }
    @Test void generationFailureKeepsOriginalAndReturnsExplicitFailure() {
        owned();var source=q(7,"test","active");when(questions.findById(7L)).thenReturn(Optional.of(source));
        when(training.ensureVariant(99L,source,"")).thenThrow(new BusinessException("模型不可用"));
        try(var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(1L);
            var response=(Map<?,?>)controller.addQuestion(99L,7L).data();
            assertEquals("failed",response.get("trainingStatus"));
            assertTrue(response.get("trainingMessage").toString().contains("模型不可用"));
            verify(classes).save(argThat((ClassQuestion link)->link.getQuestionId().equals(7L)));
        }
    }
}
