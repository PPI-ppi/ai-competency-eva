package com.huiqiyikang.assessment.service;

import com.huiqiyikang.assessment.domain.AbilityLevelScale;
import com.huiqiyikang.assessment.entity.Assessment;
import com.huiqiyikang.assessment.mapper.AssessmentRepository;
import com.huiqiyikang.assessment.profile.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AbilityServiceTest {
    @Test void memberLevelsUseClassScopedScoresAndStoredLevelWithLegacyFallback() {
        var repo=mock(AssessmentRepository.class);
        var stored=new Assessment(10L,1L);stored.setId(30L);stored.setAverageScore(82.0);stored.setAbilityLevel("L4");
        var legacy=new Assessment(10L,2L);legacy.setId(31L);legacy.setTotalScore(72.0);
        when(repo.findLatestCompletedByStudents(10L,List.of(1L,2L,3L))).thenReturn(List.of(stored,legacy));
        var service=new AbilityService(mock(AbilityProfileContextLoader.class),mock(AbilityProfileRegistry.class),repo,new AbilityLevelScale(""));
        var summaries=service.memberSummaries(10L,List.of(1L,2L,3L));
        assertEquals("L4",summaries.get(1L).level());
        assertEquals("L3",summaries.get(2L).level());
        assertFalse(summaries.containsKey(3L));
        verify(repo).findLatestCompletedByStudents(10L,List.of(1L,2L,3L));
    }
}
