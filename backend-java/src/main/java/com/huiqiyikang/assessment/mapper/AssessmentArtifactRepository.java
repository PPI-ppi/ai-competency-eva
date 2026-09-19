package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.AssessmentArtifact;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import java.util.Optional;

public interface AssessmentArtifactRepository extends BaseMapperX<AssessmentArtifact> {
    default Optional<AssessmentArtifact> findByQuestionAndType(Long questionId, String artifactType) {
        return selectList(new QueryWrapper<AssessmentArtifact>()
                .eq("assessment_question_id", questionId).eq("artifact_type", artifactType)).stream().findFirst();
    }
}
