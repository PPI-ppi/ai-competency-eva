package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.AssessmentPointState;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;
import java.util.Optional;

public interface AssessmentPointStateRepository extends BaseMapperX<AssessmentPointState> {
    default List<AssessmentPointState> findByAssessmentId(Long assessmentId) {
        return selectList(new QueryWrapper<AssessmentPointState>().eq("assessment_id", assessmentId));
    }
    default List<AssessmentPointState> findActiveByAssessmentId(Long assessmentId) {
        return selectList(new QueryWrapper<AssessmentPointState>()
                .eq("assessment_id", assessmentId).eq("status", "active"));
    }
    default Optional<AssessmentPointState> findByAssessmentIdAndPoint(Long assessmentId, String point) {
        return selectList(new QueryWrapper<AssessmentPointState>()
                .eq("assessment_id", assessmentId).eq("assessment_point", point)).stream().findFirst();
    }
    default long countActive(Long assessmentId) {
        return selectCount(new QueryWrapper<AssessmentPointState>()
                .eq("assessment_id", assessmentId).eq("status", "active"));
    }
}
