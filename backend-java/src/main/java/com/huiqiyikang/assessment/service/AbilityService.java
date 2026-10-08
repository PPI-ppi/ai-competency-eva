package com.huiqiyikang.assessment.service;

import com.huiqiyikang.assessment.profile.AbilityProfile;
import com.huiqiyikang.assessment.profile.AbilityProfileContextLoader;
import com.huiqiyikang.assessment.profile.AbilityProfileRegistry;
import org.springframework.stereotype.Service;
import com.huiqiyikang.assessment.mapper.AssessmentRepository;
import com.huiqiyikang.assessment.domain.AbilityLevelScale;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 学生能力画像的入口。
 *
 * 这个类刻意保持很薄：**只负责取材料 → 交给当前策略 → 返回画像**，
 * 不含任何"用哪几次测评、怎么算"的逻辑。算法在
 * {@code com.huiqiyikang.assessment.profile} 包里，实现 {@code AbilityProfileStrategy} 即可替换。
 *
 * 班级隔离由调用方（ClassRoomController 校验成员身份）与上下文加载器（查询一律带 class_id）
 * 共同保证：同一个学生在不同班级的画像互不影响。
 */
@Service
public class AbilityService {

    private final AssessmentRepository assessments;
    private final AbilityLevelScale levelScale;
    private final AbilityProfileContextLoader contextLoader;
    private final AbilityProfileRegistry registry;

    public AbilityService(AbilityProfileContextLoader contextLoader, AbilityProfileRegistry registry, AssessmentRepository assessments, AbilityLevelScale levelScale) {
        this.assessments = assessments;
        this.levelScale = levelScale;
        this.contextLoader = contextLoader;
        this.registry = registry;
    }

    /** GET /api/classes/{classId}/my-ability 的数据来源。 */
    public AbilityProfile myAbility(Long classId, Long studentUserId) {
        return registry.active().build(contextLoader.load(classId, studentUserId));
    }

    /** 按名字精确选用策略（留给未来的教师端班级分析等场景）。 */
    public AbilityProfile myAbility(Long classId, Long studentUserId, String strategyName) {
        return registry.byName(strategyName).build(contextLoader.load(classId, studentUserId));
    }

    /** 组织名单只需要最近完成记录的摘要，批量查询，不逐个加载完整画像。 */
    public Map<Long, AbilityProfile.Summary> memberSummaries(Long classId, Collection<Long> students) {
        Map<Long, AbilityProfile.Summary> summaries = new LinkedHashMap<>();
        for (var assessment : assessments.findLatestCompletedByStudents(classId, students)) {
            Double score = assessment.getAverageScore() != null ? assessment.getAverageScore() : assessment.getTotalScore();
            var level = levelScale.resolve(assessment.getAbilityLevel(), score);
            summaries.put(assessment.getStudentUserId(), new AbilityProfile.Summary(
                    assessment.getId(), score, level.code(), level.name(), assessment.getCompletedAt()));
        }
        return summaries;
    }

    /** 当前生效的策略名，便于诊断接口与日志。 */
    public String activeStrategy() {
        return registry.active().name();
    }
}
