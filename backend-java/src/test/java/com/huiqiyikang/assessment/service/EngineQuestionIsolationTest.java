package com.huiqiyikang.assessment.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class EngineQuestionIsolationTest {
    final AssessmentService assessments=mock(AssessmentService.class);
    final QuestionService questions=mock(QuestionService.class);
    final AssessmentQuestionRepository snapshots=mock(AssessmentQuestionRepository.class);
    final AssessmentPointStateRepository states=mock(AssessmentPointStateRepository.class);
    final ClassQuestionRepository links=mock(ClassQuestionRepository.class);
    final EngineService engine=new EngineService(assessments,questions,snapshots,mock(AssessmentAnswerRepository.class),
        states,mock(ClassQuestionFreshnessRepository.class),mock(StudentPointProfileRepository.class),
        mock(AssessmentEngineLogRepository.class),links,mock(ClassRoomRepository.class),mock(AssessmentMessageRepository.class),
        mock(AssessmentDimensionScoreRepository.class),mock(AssessmentPointScoreRepository.class),new ObjectMapper());
    AssessmentPointState initialize() {
        var assessment=new Assessment(99L,1L);assessment.setId(10L);
        when(assessments.findById(10L)).thenReturn(Optional.of(assessment));
        var point=new AssessmentPointState();point.setAssessmentId(10L);point.setAssessmentPoint("提示词书写");point.setDimension("提示词工程");
        when(states.findActiveByAssessmentId(10L)).thenAnswer(call->"active".equals(point.getStatus())?List.of(point):List.of());
        when(links.findByClassIdAndStatus(99L,"active")).thenReturn(List.of(new ClassQuestion(99L,7L),new ClassQuestion(99L,8L)));
        return point;
    }
    Question question(long id,String kind) {var q=new Question();q.setId(id);q.setQuestionKind(kind);q.setDifficulty(3);q.setAssessmentPoints("[\"提示词书写\"]");return q;}
    @Test void choosesOriginalInsteadOfTrainingVariantWithSamePointAndDifficulty() {
        initialize();var source=question(7,"test");var variant=question(8,"training");
        when(questions.findAllById(anyCollection())).thenReturn(List.of(variant,source));
        when(questions.findById(7L)).thenReturn(Optional.of(source));
        var next=engine.nextQuestion(10L);
        assertFalse(next.finished());assertEquals(7L,next.questionId());
        verify(questions,never()).testList();verify(questions,never()).publicList();
    }
    @Test void trainingOnlyOrganizationCannotUseGlobalOrTrainingQuestions() {
        initialize();when(questions.findAllById(anyCollection())).thenReturn(List.of(question(8,"training")));
        assertTrue(engine.nextQuestion(10L).finished());
        verify(snapshots,never()).save(any());verify(questions,never()).testList();verify(questions,never()).publicList();
    }
    @Test void customTrainingOnlyUsesMatchingVariantsAndPersistsActualDifficulty() {
        initialize();var assessment=assessments.findById(10L).orElseThrow();
        assessment.setTrainingConfig("{\"modes\":[\"DIALOGUE\"],\"difficulty\":4}");
        var source=question(7,"test");source.setType("DIALOGUE");source.setDifficulty(4);
        var wrong=question(8,"training");wrong.setType("PRACTICAL");wrong.setDifficulty(4);
        var matching=question(9,"training");matching.setType("DIALOGUE");matching.setDifficulty(4);
        when(questions.findAllById(anyCollection())).thenReturn(List.of(source,wrong,matching));
        when(questions.findById(9L)).thenReturn(Optional.of(matching));
        var next=engine.nextQuestion(10L);
        assertEquals(9L,next.questionId());assertEquals(4,next.difficultyLevel());
    }
}
