package com.huiqiyikang.assessment.controller;
import com.huiqiyikang.assessment.entity.*; import com.huiqiyikang.assessment.service.*;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api/assessment-tasks")
public class AssessmentTaskDetailController {
    @org.springframework.beans.factory.annotation.Autowired private TaskAssignmentService assignments;
    private final TaskService tasks; private final ClassRoomService classes; private final ClassRoomService members; private final AccountService teachers;
    public AssessmentTaskDetailController(TaskService tasks,ClassRoomService classes,ClassRoomService members,AccountService teachers){this.tasks=tasks;this.classes=classes;this.members=members;this.teachers=teachers;}
    // 融合 10.8.3：学生视角只返回安全字段（隐藏 targetStudentIds/requestKey 等内部字段），教师返回全量。
    @GetMapping("/{id}") public ApiResponse<?> detail(@PathVariable Long id){
        AssessmentTask task=tasks.findById(id).orElseThrow(()->new BusinessException("测评任务不存在"));
        boolean owner=teachers.existsByUserId(uid())&&task.getTeacherUserId().equals(uid());
        if(!owner)assignments.checkStudent(task,uid());
        Map<String,Object> data=new LinkedHashMap<>();
        if(owner)data.put("task",task);
        else{
            Map<String,Object> safe=new LinkedHashMap<>();safe.put("id",task.getId());safe.put("classId",task.getClassId());safe.put("title",task.getTitle());safe.put("description",task.getDescription());safe.put("questionCount",task.getQuestionCount());safe.put("dimensions",task.getDimensions());safe.put("assessmentPoints",task.getAssessmentPoints());safe.put("taskType",task.getTaskType());safe.put("deadlineAt",task.getDeadlineAt());safe.put("status",assignments.ended(task)?"ended":"active");data.put("task",safe);
        }
        data.put("classroom",classes.findById(task.getClassId()).orElse(null));return ApiResponse.ok(data);
    }
    private Long uid(){return StpUtil.getLoginIdAsLong();}
}
