package com.huiqiyikang.assessment.service;

import com.huiqiyikang.assessment.entity.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class TaskStatisticsServiceTest {
    private AssessmentTask task(long id, long classId, String status) {
        var task = new AssessmentTask(); task.setId(id); task.setClassId(classId); task.setStatus(status); return task;
    }
    private Assessment answer(Long taskId, long classId, long student, String status) {
        var a = new Assessment(taskId, classId, student); a.setStatus(status); return a;
    }
    @Test void onlyVisibleTasksCountAndStudentsAreDistinct() {
        var result = TaskStatisticsService.summarize(
                List.of(task(1, 10, "active"), task(2, 20, "ended"), task(3, 10, "deleted")),
                List.of(answer(1L,10,1,"completed"), answer(1L,10,1,"completed"),
                        answer(1L,10,2,"in_progress"), answer(2L,20,1,"completed_with_scoring_failure"),
                        answer(3L,10,99,"completed"), answer(null,10,98,"completed"),
                        answer(1L,99,97,"completed")),
                List.of(new ClassMember(10L,1L), new ClassMember(10L,2L), new ClassMember(20L,1L)));
        assertEquals(2, result.get("publishedCount"));
        assertEquals(1L, result.get("activeCount"));
        assertEquals(2, result.get("participantCount"));
        assertEquals(2L, result.get("completedCount"));
        assertEquals(75.0, result.get("averageCompletionRate"));
        assertEquals(0.75, result.get("completionRate"));
    }
    @Test void includesUnstartedMembersAndUnstartedTasksInAverage() {
        var result = TaskStatisticsService.summarize(
                List.of(task(1,10,"active"), task(2,10,"active")),
                List.of(answer(1L,10,1,"completed")),
                List.of(new ClassMember(10L,1L), new ClassMember(10L,2L)));
        assertEquals(25.0, result.get("averageCompletionRate"));
        assertEquals(1, result.get("participantCount"));
    }
    @Test void handlesNoTasksAndNoMembersWithoutNaN() {
        assertEquals(0.0, TaskStatisticsService.summarize(List.of(), List.of(), List.of()).get("averageCompletionRate"));
        assertEquals(0.0, TaskStatisticsService.summarize(List.of(task(1,10,"active")),
                List.of(answer(1L,10,1,"completed")),List.of()).get("averageCompletionRate"));
    }
    @Test void removedMembersDoNotInflateCompletionRate() {
        var removed = new ClassMember(10L,2L); removed.setStatus("removed");
        var result = TaskStatisticsService.summarize(List.of(task(1,10,"active")),
                List.of(answer(1L,10,2,"completed")), List.of(new ClassMember(10L,1L),removed));
        assertEquals(0.0, result.get("averageCompletionRate"));
    }
}
