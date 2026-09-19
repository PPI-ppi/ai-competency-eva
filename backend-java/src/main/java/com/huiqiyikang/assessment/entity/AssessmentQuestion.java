package com.huiqiyikang.assessment.entity;

import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("assessment_questions")
@Getter @Setter @NoArgsConstructor
public class AssessmentQuestion {
    @TableId(type=IdType.AUTO) Long id;
    Long assessmentId; Long questionId;
    Integer sequenceNo; String type;
    String contentSnapshot;
    String optionsSnapshot; String answerSnapshot;
    String rubricSnapshot; Integer difficultySnapshot;
    String tagsSnapshot; String assessmentPointsSnapshot;
    String status="sent"; boolean finished; Instant sentAt=Instant.now(); Instant answeredAt;
    // ---- 引擎 5.0 增量字段（对应 01_engine.sql 新加列） ----
    String pointName; String dimensionName; Double difficultyValue;
    Double rInitial; Double rFinal; Double signalValue;
    boolean followedUp; Integer followUpTurns=0;
    public AssessmentQuestion(Long assessmentId,Long questionId,Integer sequenceNo,String type,String content,String options,String answer,String rubric,Integer difficulty){this.assessmentId=assessmentId;this.questionId=questionId;this.sequenceNo=sequenceNo;this.type=type;contentSnapshot=content;optionsSnapshot=options;answerSnapshot=answer;rubricSnapshot=rubric;difficultySnapshot=difficulty;}
}
