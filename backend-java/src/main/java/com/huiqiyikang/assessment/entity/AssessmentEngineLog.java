package com.huiqiyikang.assessment.entity;
import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;

/**
 * 引擎决策日志：每次选题/评分/追问/收尾/画像各写一行，便于回放与调参。
 */
@TableName("assessment_engine_logs")
@Getter @Setter @NoArgsConstructor
public class AssessmentEngineLog {
    @TableId(type=IdType.AUTO) Long id;
    Long assessmentId; Long studentUserId; Long classId;
    String event; String assessmentPoint; String payload;
    Instant createdAt=Instant.now();
}
