package com.huiqiyikang.assessment.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class FollowupConversationTest {
    @Test void conversationKeepsOriginalAndRestoresFollowupAnswers() {
        var repo=mock(AssessmentService.class);
        var service=new AssessmentAgentService(repo,mock(EngineService.class),mock(LlmClient.class),mock(AssessmentQuestionRepository.class),mock(AssessmentDimensionScoreRepository.class),mock(AssessmentPointScoreRepository.class),new ObjectMapper());
        var a=new Assessment();a.setId(1L);a.setStudentUserId(2L);a.setStatus("in_progress");
        var q=new AssessmentQuestion();q.setId(7L);q.setAssessmentId(1L);q.setStatus("sent");q.setContentSnapshot("题干");q.setRInitial(.5);
        var answer=new AssessmentAnswer();answer.setAnswerContent("原始方案");
        when(repo.findById(1L)).thenReturn(Optional.of(a));
        when(repo.findByAssessmentIdOrderBySequenceNo(1L)).thenReturn(List.of(q));
        when(repo.findByAssessmentQuestionId(7L)).thenReturn(Optional.of(answer));
        when(repo.findByAssessmentQuestionIdOrderBySequenceNo(7L)).thenReturn(List.of(new AssessmentMessage(1L,7L,"ai","题干",1),new AssessmentMessage(1L,7L,"student","原始方案",2),new AssessmentMessage(1L,7L,"ai","追问一",3),new AssessmentMessage(1L,7L,"student","补充回答",4),new AssessmentMessage(1L,7L,"ai","追问二",5)));
        var data=service.conversation(1L,2L);
        var current=(Map<?,?>)data.get("question");
        assertEquals(true,current.get("awaitingFollowup"));assertEquals("原始方案",current.get("finalAnswer"));
        var followups=(List<Map<String,Object>>)data.get("followUps");
        assertEquals(2,followups.size());assertEquals("补充回答",followups.get(0).get("answer"));assertFalse(followups.get(1).containsKey("answer"));
        q.setRFinal(.8);assertEquals(false,((Map<?,?>)service.conversation(1L,2L).get("question")).get("awaitingFollowup"));
    }
}
