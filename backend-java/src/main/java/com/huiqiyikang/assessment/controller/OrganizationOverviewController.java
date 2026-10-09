package com.huiqiyikang.assessment.controller;
import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import com.huiqiyikang.assessment.service.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.time.Instant;

@RestController @RequestMapping("/api/teacher")
public class OrganizationOverviewController {
    private final TaskAssignmentService tasks;private final GrowthService growth;private final ClassMemberRepository members;private final ClassRoomRepository classes;
    public OrganizationOverviewController(TaskAssignmentService t,GrowthService g,ClassMemberRepository m,ClassRoomRepository c){tasks=t;growth=g;members=m;classes=c;}
    @PostMapping("/students/{studentId}/remedial-tasks")
    public ApiResponse<?> remedial(@PathVariable Long studentId,@RequestBody TaskAssignmentService.Publish body){return ApiResponse.ok(tasks.publish(body,StpUtil.getLoginIdAsLong(),studentId));}
    @GetMapping("/classes/{classId}/overview")
    @SuppressWarnings("unchecked")
    public ApiResponse<?> overview(@PathVariable Long classId){
        tasks.owned(classId,StpUtil.getLoginIdAsLong());Map<String,Object> r=new LinkedHashMap<>(growth.average(classId));
        Map<String,Integer> levels=new LinkedHashMap<>();for(int i=0;i<=5;i++)levels.put("L"+i,0);
        int unassessed=0;for(ClassMember m:members.findByClassIdAndStatus(classId,"active")){
            Map<String,Object> p=growth.profile(classId,m.getStudentUserId());String level=String.valueOf(((Map<?,?>)p.get("latest")).get("level"));levels.merge(level,1,Integer::sum);
            if(!Boolean.TRUE.equals(p.get("hasAssessment")))unassessed++;
        }
        r.put("levelDistribution",levels);r.put("unassessedCount",unassessed);r.put("tasks",tasks.statistics(tasks.classTasks(classId)));r.put("calculatedAt",Instant.now());return ApiResponse.ok(r);
    }
    @GetMapping("/assessment-tasks/statistics")
    public ApiResponse<?> statistics(){List<AssessmentTask> all=new ArrayList<>();for(ClassRoom c:classes.findByTeacherUserId(StpUtil.getLoginIdAsLong()))if(c.getPersonalOwnerId()==null)all.addAll(tasks.classTasks(c.getId()));return ApiResponse.ok(tasks.statistics(all));}
}
