package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("assessment_answers") @Getter @Setter @NoArgsConstructor
public class AssessmentAnswer { @TableId(type=IdType.AUTO) Long id; Long assessmentQuestionId; String answerContent; Integer answerCount=1; String resultStatus="pending"; Double score; String scoringReason; String scoringEvidence; Double confidence; String clarity; String artifactIds; Instant submittedAt=Instant.now(); Instant scoredAt; public AssessmentAnswer(Long q,String content){assessmentQuestionId=q;answerContent=content;} }
