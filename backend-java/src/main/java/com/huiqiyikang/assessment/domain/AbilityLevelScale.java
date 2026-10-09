package com.huiqiyikang.assessment.domain;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 能力等级划档（L0–L5）的唯一实现。
 *
 * 学生工作台、能力接口、教师端都用同一套口径，前端只展示不计算。
 * 阈值来自配置 `app.ability-levels`（逗号分隔的「最低分:等级:名称」，从高到低），
 * 现场要临时调档位时改环境变量即可，不用碰代码。
 *
 * 无测评记录时是 L0「等待启程」；综合分按档位顺次比较，取第一个 score >= 最低分 的档位。
 */
@Component
public class AbilityLevelScale {

    /** 一个档位：code 形如 L3，name 是展示名。 */
    public record Level(String code, String name) {
    }

    private record Threshold(double minScore, String code, String name) {
    }

    public static final Level EMPTY = new Level("L0", "等待启程");

    public static final String DEFAULT_SPEC =
            "90:L5:创新应用者,80:L4:人机协同专家,70:L3:应用进阶者,60:L2:工具使用者,0:L1:基础认知者";

    private final List<Threshold> thresholds;

    public AbilityLevelScale(@Value("${app.ability-levels:" + DEFAULT_SPEC + "}") String spec) {
        this.thresholds = parse(spec);
    }

    /** 按综合分划档；分数为空（没有测评记录）时是 L0。 */
    public Level of(Double score) {
        if (score == null) return EMPTY;
        for (Threshold threshold : thresholds) {
            if (score >= threshold.minScore()) return new Level(threshold.code(), threshold.name());
        }
        return EMPTY;
    }

    /** 只拿到了落库的等级码时，反查展示名；查不到就按分数重新划档。 */
    public Level resolve(String code, Double score) {
        if (code != null && !code.isBlank()) {
            for (Threshold threshold : thresholds) {
                if (threshold.code().equalsIgnoreCase(code.trim()))
                    return new Level(threshold.code(), threshold.name());
            }
            if (EMPTY.code().equalsIgnoreCase(code.trim())) return EMPTY;
        }
        return of(score);
    }

    private static List<Threshold> parse(String spec) {
        List<Threshold> parsed = new ArrayList<>();
        if (spec != null) {
            for (String chunk : spec.split(",")) {
                String[] parts = chunk.trim().split(":");
                if (parts.length != 3) continue;
                try {
                    parsed.add(new Threshold(Double.parseDouble(parts[0].trim()), parts[1].trim(), parts[2].trim()));
                } catch (NumberFormatException ignored) {
                    // 单条写坏不影响其它档位
                }
            }
        }
        if (parsed.isEmpty()) {
            for (String chunk : DEFAULT_SPEC.split(",")) {
                String[] parts = chunk.split(":");
                parsed.add(new Threshold(Double.parseDouble(parts[0]), parts[1], parts[2]));
            }
        }
        return parsed;
    }
}
