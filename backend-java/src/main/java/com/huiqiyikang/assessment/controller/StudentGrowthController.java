package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.huiqiyikang.assessment.common.*;
import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import com.huiqiyikang.assessment.service.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/api")
public class StudentGrowthController {
    private final ClassRoomRepository classes;private final ClassMemberRepository members;private final StudentRepository students;
    private final UserRepository users;private final AssessmentRepository assessments;private final GrowthService growth;private final ReportSnapshotService reports;
    public StudentGrowthController(ClassRoomRepository c,ClassMemberRepository m,StudentRepository s,UserRepository u,AssessmentRepository a,GrowthService g,ReportSnapshotService r){classes=c;members=m;students=s;users=u;assessments=a;growth=g;reports=r;}
    private Long uid(){return StpUtil.getLoginIdAsLong();}
    private ClassMember member(Long id){return members.findByClassIdAndStudentUserId(id,uid()).filter(m->"active".equals(m.getStatus())).orElseThrow(()->new BusinessException("不是该组织有效成员",HttpStatus.FORBIDDEN));}
    public record PersonalRequest(Map<String,Integer> pointWeights){}
    @PostMapping("/classes/personal") @Transactional
    public ApiResponse<?> personal(@RequestBody PersonalRequest request){
        Long user=uid();if(!students.existsByUserId(user))throw new BusinessException("只有学生可以创建个人组织");
        // Serialize retries for this owner. The database also has a unique personal_owner_id.
        users.selectOne(new QueryWrapper<User>().eq("id",user).last("FOR UPDATE"));
        ClassRoom existing=classes.selectOne(new QueryWrapper<ClassRoom>().eq("personal_owner_id",user));
        if(existing!=null){ClassMember m=members.findByClassIdAndStudentUserId(existing.getId(),user).orElseThrow();m.setStatus("active");members.save(m);return ApiResponse.ok(existing);}
        if(request.pointWeights()==null||request.pointWeights().isEmpty()||request.pointWeights().values().stream().noneMatch(w->w!=null&&w>0))throw new BusinessException("请选择考察点，至少一个权重大于0");
        for(var e:request.pointWeights().entrySet()){try{AiTaxonomy.dimensionOf(e.getKey());}catch(IllegalArgumentException ex){throw new BusinessException(ex.getMessage());}if(e.getValue()==null||e.getValue()<0||e.getValue()>10)throw new BusinessException("权重必须为0–10整数");}
        ClassRoom c=new ClassRoom(user,"自选考察点1","个人考察点与权重配置");c.setPersonalOwnerId(user);c.setPointWeights(growth.encode(request.pointWeights()));classes.save(c);members.save(new ClassMember(c.getId(),user));return ApiResponse.ok(c);
    }
    public record TrainingRequest(Long classId,List<String> dimensions,List<String> modes,Integer difficulty,Integer questionCount){}
    // 注意：/training/start 由 AssessmentController 提供（契约含 assessmentPoints + 组织训练题库校验），
    // 此处不重复映射，避免 Spring 双映射启动冲突。
    @GetMapping("/training/advice") @Transactional
    @SuppressWarnings("unchecked") public ApiResponse<?> advice(@RequestParam Long classId){
        ClassMember m=member(classId);Map<String,Object> p=growth.profile(classId,uid());
        if(!Boolean.TRUE.equals(p.get("hasAssessment")))return ApiResponse.ok(Map.of("available",false,"content","请先完成测评"));
        String version=growth.encode(p);
        if(!version.equals(m.getTrainingAdviceVersion())||m.getTrainingAdvice()==null||m.getTrainingAdvice().contains("根据本组织的总体能力画像")){
            List<Map<String,Object>> dims=(List<Map<String,Object>>)p.get("dimensions");
            String weak=dims.stream().filter(d->d.get("score") instanceof Number).min(Comparator.comparingDouble(d->((Number)d.get("score")).doubleValue())).map(d->String.valueOf(d.get("dimension"))).orElse("已评估能力");
            List<Map<String,Object>> points=(List<Map<String,Object>>)p.get("points");
            String focus=String.join("、",points.stream().filter(d->d.get("score") instanceof Number).sorted(Comparator.comparingDouble(d->((Number)d.get("score")).doubleValue())).limit(3).map(d->String.valueOf(d.get("name"))).toList());
            String content="根据你在当前组织的总体能力画像，建议优先训练“"+weak+"”。重点练习："+focus+"。对照题目要求复盘答案与评分依据，每次只调整一个策略并比较结果，再补充尚未考察的能力。";
            m.setTrainingAdvice(content);m.setTrainingAdviceVersion(version);members.save(m);
        }
        return ApiResponse.ok(Map.of("available",true,"title","根据你的总体能力画像生成","content",m.getTrainingAdvice()));
    }
    @GetMapping("/classes/{id}/assessment-results/average")
    public ApiResponse<?> average(@PathVariable Long id){
        ClassRoom c=classes.findById(id).orElseThrow(()->new BusinessException("组织不存在"));
        if(!c.getTeacherUserId().equals(uid()))member(id);
        return ApiResponse.ok(growth.average(id));
    }
    @GetMapping("/teacher/classes/{classId}/students/{studentId}/profile")
    public ApiResponse<?> studentProfile(@PathVariable Long classId,@PathVariable Long studentId){
        ClassRoom c=classes.findById(classId).orElseThrow(()->new BusinessException("组织不存在"));
        if(c.getPersonalOwnerId()!=null||!c.getTeacherUserId().equals(uid()))throw new BusinessException("无权查看",HttpStatus.FORBIDDEN);
        if(!members.findByClassIdAndStudentUserId(classId,studentId).map(m->"active".equals(m.getStatus())).orElse(false))throw new BusinessException("学生不在该组织");
        return ApiResponse.ok(growth.profile(classId,studentId));
    }
    @GetMapping("/reports/{id}/snapshot") public ApiResponse<?> snapshot(@PathVariable Long id){
        Assessment a=assessments.findById(id).orElseThrow(()->new BusinessException("报告不存在",HttpStatus.NOT_FOUND));
        boolean teacher=classes.findById(a.getClassId()).map(c->c.getTeacherUserId().equals(uid())&&c.getPersonalOwnerId()==null).orElse(false);
        if(!a.getStudentUserId().equals(uid())&&!teacher)throw new BusinessException("无权查看该报告",HttpStatus.FORBIDDEN);
        if(!AssessmentRepository.COMPLETED_STATUSES.contains(a.getStatus()))throw new BusinessException("测评尚未完成");return ApiResponse.ok(reports.freeze(id));
    }
}
