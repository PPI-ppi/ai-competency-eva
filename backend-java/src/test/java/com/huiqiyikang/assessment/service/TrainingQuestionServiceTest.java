package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.ClassQuestionRepository;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TrainingQuestionServiceTest {
    final ClassQuestionRepository links=mock(ClassQuestionRepository.class);
    final QuestionService questions=mock(QuestionService.class);
    final LlmClient llm=mock(LlmClient.class);
    final TrainingQuestionService service=new TrainingQuestionService(links,questions,llm,new ObjectMapper());
    Question source() {var q=new Question();q.setId(7L);q.setOwnerUserId(1L);q.setQuestionKind("test");return q;}
    @Test void repeatedGenerationReusesOneVariantAndRestoresRemovedLink() {
        var source=source();var train=new Question();train.setId(8L);train.setQuestionKind("training");
        var removed=new ClassQuestion(99L,8L);removed.setStatus("removed");removed.setRemovedAt(java.time.Instant.now());
        when(links.lockSource(99L,7L)).thenReturn(new ClassQuestion(99L,7L));
        when(links.findTrainingVariant(99L,7L)).thenReturn(train);
        when(links.findByClassIdAndQuestionId(99L,8L)).thenReturn(Optional.of(removed));
        assertSame(train,service.ensureVariant(99L,source,""));
        assertSame(train,service.ensureVariant(99L,source,""));
        verifyNoInteractions(llm,questions);
        assertEquals("active",removed.getStatus());assertNull(removed.getRemovedAt());
    }
    @Test void createsOnlyTrainingVariantWithSourceAndOrganizationAssociation() {
        var source=source();when(links.lockSource(99L,7L)).thenReturn(new ClassQuestion(99L,7L));
        when(llm.generateSimilarQuestion(any(),anyString(),anyList(),anyList(),anyInt())).thenReturn(
                new LlmClient.GeneratedQuestion("DIALOGUE","变体","题干",null,null,"标准",3,List.of("AI基础认知"),List.of("AI基本概念理解")));
        when(questions.save(any())).thenAnswer(call->{Question q=call.getArgument(0);q.setId(8L);return q;});
        var train=service.ensureVariant(99L,source,"");
        assertEquals("training",train.getQuestionKind());assertEquals(7L,train.getSourceQuestionId());
        verify(links).save(argThat(link->link.getClassId().equals(99L)&&link.getQuestionId().equals(8L)));
    }
    @Test void rejectsTrainingSourcesAndUnlinkedOrRemovedOriginals() {
        var source=source();source.setQuestionKind("training");
        assertThrows(BusinessException.class,()->service.ensureVariant(99L,source,""));
        verifyNoInteractions(llm,links);
        source.setQuestionKind("test");
        assertThrows(BusinessException.class,()->service.ensureVariant(99L,source,""));
        var removed=new ClassQuestion(99L,7L);removed.setStatus("removed");
        when(links.lockSource(99L,7L)).thenReturn(removed);
        assertThrows(BusinessException.class,()->service.ensureVariant(99L,source,""));
        verifyNoInteractions(llm,questions);
    }
    @Test void modelFailureDoesNotSaveOrLinkPartialVariant() {
        when(links.lockSource(99L,7L)).thenReturn(new ClassQuestion(99L,7L));
        when(llm.generateSimilarQuestion(any(),anyString(),anyList(),anyList(),anyInt())).thenThrow(new BusinessException("模型不可用"));
        assertThrows(BusinessException.class,()->service.ensureVariant(99L,source(),""));
        verifyNoInteractions(questions);verify(links,never()).save(any());
    }
}
