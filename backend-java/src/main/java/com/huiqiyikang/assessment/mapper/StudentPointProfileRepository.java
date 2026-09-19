package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.StudentPointProfile;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;
import java.util.Optional;

public interface StudentPointProfileRepository extends BaseMapperX<StudentPointProfile> {
    default List<StudentPointProfile> findByStudentAndClass(Long studentUserId, Long classId) {
        return selectList(new QueryWrapper<StudentPointProfile>()
                .eq("student_user_id", studentUserId).eq("class_id", classId));
    }
    default Optional<StudentPointProfile> findByKey(Long classId, Long studentUserId, String point) {
        return selectList(new QueryWrapper<StudentPointProfile>()
                .eq("class_id", classId).eq("student_user_id", studentUserId)
                .eq("assessment_point", point)).stream().findFirst();
    }
}
