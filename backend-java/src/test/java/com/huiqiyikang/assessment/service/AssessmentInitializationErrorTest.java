package com.huiqiyikang.assessment.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.mapper.*;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import java.io.ByteArrayOutputStream;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AssessmentInitializationErrorTest {
    @Test void initializationFailureStaysAnSseErrorInsteadOfEscapingAsHttp500() {
        var assessments=mock(AssessmentService.class);var engine=mock(EngineService.class);
        var service=new AssessmentAgentService(assessments,engine,mock(LlmClient.class),mock(AssessmentQuestionRepository.class),mock(AssessmentDimensionScoreRepository.class),mock(AssessmentPointScoreRepository.class),new ObjectMapper());
        var assessment=new Assessment(99L,1L);assessment.setId(10L);
        when(assessments.findById(10L)).thenReturn(Optional.of(assessment));
        when(engine.initializeExistingAssessment(10L)).thenThrow(new DataIntegrityViolationException("模拟初始化失败"));
        var stream=new ByteArrayOutputStream();
        assertDoesNotThrow(()->service.chatStream(10L,1L,Map.of("content",""),stream));
        assertTrue(stream.toString().startsWith("event: error\n"));
        assertTrue(stream.toString().contains("模拟初始化失败"));
        verify(assessments,never()).findByAssessmentIdOrderBySequenceNo(anyLong());
    }
}
