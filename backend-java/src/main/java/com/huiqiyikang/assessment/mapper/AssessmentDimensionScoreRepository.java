package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.AssessmentDimensionScore;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.List;
public interface AssessmentDimensionScoreRepository extends BaseMapperX<AssessmentDimensionScore>{
    default List<AssessmentDimensionScore> findByAssessmentId(Long assessmentId){
        return selectList(new QueryWrapper<AssessmentDimensionScore>().eq("assessment_id",assessmentId).orderByAsc("dimension"));
    }
    default List<AssessmentDimensionScore> findHistoryByClassAndStudent(Long classId, Long studentUserId){
        return selectList(new QueryWrapper<AssessmentDimensionScore>()
                .eq("class_id", classId).eq("student_user_id", studentUserId).orderByDesc("id"));
    }
}
