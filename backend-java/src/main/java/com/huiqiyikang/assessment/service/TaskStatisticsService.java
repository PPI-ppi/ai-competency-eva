package com.huiqiyikang.assessment.service;

import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.stereotype.Service;
import java.util.*;
import java.util.stream.Collectors;

/** 管理员任务统计：只统计其组织内未删除的任务，不混入自主测评。 */
@Service
public class TaskStatisticsService {
    private final ClassRoomRepository classes;
    private final AssessmentTaskRepository tasks;
    private final AssessmentRepository assessments;
    private final ClassMemberRepository members;

    public TaskStatisticsService(ClassRoomRepository classes, AssessmentTaskRepository tasks,
                                 AssessmentRepository assessments, ClassMemberRepository members) {
        this.classes = classes;
        this.tasks = tasks;
        this.assessments = assessments;
        this.members = members;
    }

    public Map<String, Object> forTeacher(Long teacherId) {
        List<Long> classIds = classes.findByTeacherUserId(teacherId).stream().map(ClassRoom::getId).toList();
        List<AssessmentTask> visibleTasks = tasks.findVisibleByClassIds(classIds);
        return summarize(visibleTasks, assessments.findByTaskIdIn(visibleTasks.stream().map(AssessmentTask::getId).toList()),
                members.findActiveByClassIds(classIds));
    }

    static Map<String, Object> summarize(List<AssessmentTask> tasks, List<Assessment> assessments,
                                         List<ClassMember> members) {
        Map<Long, AssessmentTask> taskById = tasks.stream().filter(t -> !"deleted".equals(t.getStatus()))
                .collect(Collectors.toMap(AssessmentTask::getId, t -> t));
        Map<Long, Set<Long>> activeMembers = new HashMap<>();
        for (ClassMember member : members) {
            if ("active".equals(member.getStatus())) {
                activeMembers.computeIfAbsent(member.getClassId(), k -> new HashSet<>()).add(member.getStudentUserId());
            }
        }
        Set<Long> participants = new HashSet<>();
        Map<Long, Set<Long>> completedByTask = new HashMap<>();
        for (Assessment assessment : assessments) {
            AssessmentTask task = taskById.get(assessment.getTaskId());
            if (task == null || !Objects.equals(task.getClassId(), assessment.getClassId())) continue;
            participants.add(assessment.getStudentUserId());
            if (AssessmentRepository.COMPLETED_STATUSES.contains(assessment.getStatus())) {
                completedByTask.computeIfAbsent(task.getId(), k -> new HashSet<>()).add(assessment.getStudentUserId());
            }
        }
        double rateSum = 0;
        long completedCount = 0;
        for (AssessmentTask task : taskById.values()) {
            Set<Long> eligible = activeMembers.getOrDefault(task.getClassId(), Set.of());
            Set<Long> completed = completedByTask.getOrDefault(task.getId(), Set.of());
            completedCount += completed.size();
            long eligibleCompleted = completed.stream().filter(eligible::contains).count();
            rateSum += eligible.isEmpty() ? 0 : (double) eligibleCompleted / eligible.size();
        }
        double rate = taskById.isEmpty() ? 0 : rateSum / taskById.size();
        long activeCount = taskById.values().stream().filter(t -> "active".equals(t.getStatus()) || "in_progress".equals(t.getStatus())).count();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("publishedCount", taskById.size());
        data.put("activeCount", activeCount);
        data.put("participantCount", participants.size());
        data.put("averageCompletionRate", Math.round(rate * 1000.0) / 10.0);
        // 兼容旧客户端，completionRate 保留 0～1 的比例。
        data.put("taskCount", taskById.size());
        data.put("ongoingCount", activeCount);
        data.put("completedCount", completedCount);
        data.put("completionRate", rate);
        return data;
    }
}
