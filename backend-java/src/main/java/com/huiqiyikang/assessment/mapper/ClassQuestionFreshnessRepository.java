package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.ClassQuestionFreshness;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;
import java.util.Optional;

public interface ClassQuestionFreshnessRepository extends BaseMapperX<ClassQuestionFreshness> {
    default List<ClassQuestionFreshness> findByClassId(Long classId) {
        return selectList(new QueryWrapper<ClassQuestionFreshness>().eq("class_id", classId));
    }
    default Optional<ClassQuestionFreshness> findByClassIdAndQuestionId(Long classId, Long questionId) {
        return selectList(new QueryWrapper<ClassQuestionFreshness>()
                .eq("class_id", classId).eq("question_id", questionId)).stream().findFirst();
    }
}
