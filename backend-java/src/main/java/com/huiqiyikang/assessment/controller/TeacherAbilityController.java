package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.service.AbilityService;
import com.huiqiyikang.assessment.service.ClassRoomService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/** 管理员查看本组织有效成员的画像；与学生端复用同一画像算法。 */
@RestController
@RequestMapping("/api/teacher")
public class TeacherAbilityController {
    private final ClassRoomService classes;
    private final AbilityService abilities;

    public TeacherAbilityController(ClassRoomService classes, AbilityService abilities) {
        this.classes = classes;
        this.abilities = abilities;
    }

    @GetMapping("/classes/{classId}/students/{studentId}/profile")
    public ApiResponse<?> profile(@PathVariable Long classId, @PathVariable Long studentId) {
        var classroom = classes.findById(classId)
                .orElseThrow(() -> new BusinessException("组织不存在", HttpStatus.NOT_FOUND));
        if (!classroom.getTeacherUserId().equals(StpUtil.getLoginIdAsLong())) {
            throw new BusinessException("无权查看该组织成员的能力画像", HttpStatus.FORBIDDEN);
        }
        if (!classes.findByClassIdAndStudentUserId(classId, studentId)
                .map(member -> "active".equals(member.getStatus())).orElse(false)) {
            throw new BusinessException("该学生不是组织有效成员", HttpStatus.NOT_FOUND);
        }
        return ApiResponse.ok(Map.of("profile", abilities.myAbility(classId, studentId)));
    }
}
