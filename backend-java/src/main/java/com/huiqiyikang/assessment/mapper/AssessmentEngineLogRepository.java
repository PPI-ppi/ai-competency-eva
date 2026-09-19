package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.AssessmentEngineLog;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;

public interface AssessmentEngineLogRepository extends BaseMapperX<AssessmentEngineLog> {
    default List<AssessmentEngineLog> findByAssessmentId(Long assessmentId) {
        return selectList(new QueryWrapper<AssessmentEngineLog>()
                .eq("assessment_id", assessmentId).orderByAsc("id"));
    }
}
