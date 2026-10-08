package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.profile.AbilityProfile;
import com.huiqiyikang.assessment.service.*;
import org.junit.jupiter.api.Test;
import java.util.Optional;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TeacherAbilityControllerTest {
    @Test void rejectsOtherOrganizationOwnersBeforeReadingProfile() {
        var classes=mock(ClassRoomService.class); var abilities=mock(AbilityService.class);
        var classroom=new ClassRoom(); classroom.setTeacherUserId(9L);
        when(classes.findById(1L)).thenReturn(Optional.of(classroom));
        try (var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(2L);
            assertThrows(BusinessException.class,()->new TeacherAbilityController(classes,abilities).profile(1L,3L));
            verifyNoInteractions(abilities);
        }
    }
    @Test void rejectsRemovedMembersAndReturnsEmptyProfileForUntestedMember() {
        var classes=mock(ClassRoomService.class); var abilities=mock(AbilityService.class);
        var classroom=new ClassRoom(); classroom.setTeacherUserId(2L);
        when(classes.findById(1L)).thenReturn(Optional.of(classroom));
        var member=new ClassMember(1L,3L); member.setStatus("removed");
        when(classes.findByClassIdAndStudentUserId(1L,3L)).thenReturn(Optional.of(member));
        try (var auth=mockStatic(StpUtil.class)) {
            auth.when(StpUtil::getLoginIdAsLong).thenReturn(2L);
            var controller=new TeacherAbilityController(classes,abilities);
            assertThrows(BusinessException.class,()->controller.profile(1L,3L));
            verifyNoInteractions(abilities);
            member.setStatus("active");
            var empty=AbilityProfile.empty(1L);
            when(abilities.myAbility(1L,3L)).thenReturn(empty);
            assertSame(empty, ((Map<?,?>)controller.profile(1L,3L).data()).get("profile"));
            verify(abilities).myAbility(1L,3L);
        }
    }
}
