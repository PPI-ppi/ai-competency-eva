# -*- coding: utf-8 -*-
"""后端：result() 补齐 skillTree / beforeDimensions / 维度分析文本；repository 加历史查询"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

# ========== 1) AssessmentDimensionScoreRepository 加历史查询 ==========
P1 = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\mapper\AssessmentDimensionScoreRepository.java"
s1 = io.open(P1, encoding='utf-8').read()
old1 = '''    default List<AssessmentDimensionScore> findByAssessmentId(Long assessmentId){
        return selectList(new QueryWrapper<AssessmentDimensionScore>().eq("assessment_id",assessmentId).orderByAsc("dimension"));
    }
}'''
assert s1.count(old1) == 1, f'r1 {s1.count(old1)}'
new1 = '''    default List<AssessmentDimensionScore> findByAssessmentId(Long assessmentId){
        return selectList(new QueryWrapper<AssessmentDimensionScore>().eq("assessment_id",assessmentId).orderByAsc("dimension"));
    }
    default List<AssessmentDimensionScore> findHistoryByClassAndStudent(Long classId, Long studentUserId){
        return selectList(new QueryWrapper<AssessmentDimensionScore>()
                .eq("class_id", classId).eq("student_user_id", studentUserId).orderByDesc("id"));
    }
}'''
s1 = s1.replace(old1, new1, 1)
io.open(P1, 'w', encoding='utf-8', newline='').write(s1)
print('repository OK')

# ========== 2) AssessmentAgentService：import + result() 增强 ==========
P2 = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\service\AssessmentAgentService.java"
s2 = io.open(P2, encoding='utf-8').read()

old_import = "import com.huiqiyikang.assessment.entity.Assessment;\nimport com.huiqiyikang.assessment.entity.AssessmentAnswer;"
assert s2.count(old_import) == 1, f'i2 {s2.count(old_import)}'
s2 = s2.replace(old_import,
    "import com.huiqiyikang.assessment.entity.Assessment;\nimport com.huiqiyikang.assessment.entity.AssessmentAnswer;\nimport com.huiqiyikang.assessment.entity.AssessmentDimensionScore;\nimport com.huiqiyikang.assessment.entity.AssessmentPointScore;", 1)

old_result = '''    public Map<String, Object> result(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        EngineService.ReportData freshReport = null;
        if ("completed".equals(assessment.getStatus())) {
            freshReport = engine.reportData(assessmentId);
            assessment = assessments.findById(assessmentId).orElse(assessment);
        }
        List<AssessmentQuestion> questions = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<Long> questionIds = questions.stream().map(AssessmentQuestion::getId).toList();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessment", assessmentView(assessment));
        data.put("questions", questions.stream().map(this::snapshotView).toList());
        data.put("answers", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .map(this::answerView).toList());
        data.put("dimensions", freshReport == null
                ? dimensionScores.findByAssessmentId(assessmentId)
                : freshReport.dimensions());
        data.put("points", freshReport == null
                ? pointScores.findByAssessmentId(assessmentId)
                : freshReport.points());
        data.put("advice", assessment.getAdvice());
        data.put("hasScoringFailure", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .anyMatch(a -> "scoring_failed".equals(a.getResultStatus())));
        return data;
    }'''
assert s2.count(old_result) == 1, f'r2 {s2.count(old_result)}'
new_result = '''    public Map<String, Object> result(Long assessmentId, Long userId) {
        Assessment assessment = owned(assessmentId, userId);
        EngineService.ReportData freshReport = null;
        if ("completed".equals(assessment.getStatus())) {
            freshReport = engine.reportData(assessmentId);
            assessment = assessments.findById(assessmentId).orElse(assessment);
        }
        List<AssessmentQuestion> questions = assessments.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<Long> questionIds = questions.stream().map(AssessmentQuestion::getId).toList();

        // —— 报告增强：维度分析文本（来自 AI 建议 JSON）、测评前六维（历史维度分）、技能树（考察点得分） ——
        Map<String, Object> adviceData = parseReportAdvice(assessment.getAdvice());
        @SuppressWarnings("unchecked")
        Map<String, String> adviceDims = adviceData == null ? Map.of()
                : (Map<String, String>) adviceData.getOrDefault("dimensions", Map.of());

        List<Map<String, Object>> dimViews = new ArrayList<>();
        List<?> dimRows = freshReport == null
                ? dimensionScores.findByAssessmentId(assessmentId)
                : freshReport.dimensions();
        for (Object row : dimRows) {
            Map<String, Object> view = new LinkedHashMap<>();
            if (row instanceof EngineService.ReportDimension rd) {
                view.put("dimension", rd.name()); view.put("name", rd.name());
                view.put("score", rd.score()); view.put("questionCount", rd.questionCount());
                view.put("tested", rd.tested());
            } else if (row instanceof AssessmentDimensionScore ds) {
                view.put("dimension", ds.getDimension()); view.put("name", ds.getDimension());
                view.put("score", ds.getScore()); view.put("questionCount", ds.getQuestionCount());
                view.put("tested", ds.getScore() != null && ds.getScore() > 0);
            } else {
                continue;
            }
            view.put("analysis", adviceDims.getOrDefault(String.valueOf(view.get("dimension")), ""));
            dimViews.add(view);
        }

        // 测评前六维：该学生该班级在本场开始前最近一次历史测评的维度分
        List<Map<String, Object>> beforeViews = new ArrayList<>();
        Map<String, AssessmentDimensionScore> latestBefore = new LinkedHashMap<>();
        if (assessment.getClassId() != null) {
            for (AssessmentDimensionScore h : dimensionScores
                    .findHistoryByClassAndStudent(assessment.getClassId(), assessment.getStudentUserId())) {
                if (assessment.getStartedAt() != null && h.getCreatedAt() != null
                        && !h.getCreatedAt().isBefore(assessment.getStartedAt())) continue;
                latestBefore.putIfAbsent(h.getDimension(), h);
            }
        }
        for (Map<String, Object> dv : dimViews) {
            AssessmentDimensionScore h = latestBefore.get(dv.get("dimension"));
            Map<String, Object> bv = new LinkedHashMap<>();
            bv.put("dimension", dv.get("dimension")); bv.put("name", dv.get("dimension"));
            bv.put("score", h == null ? null : h.getScore());
            bv.put("questionCount", h == null ? 0 : h.getQuestionCount());
            beforeViews.add(bv);
        }

        // 技能树：六维考察点，状态由得分推导（>=75 已掌握 / >0 学习中 / 未测 locked）
        List<Map<String, Object>> skillTree = new ArrayList<>();
        List<?> pointRows = freshReport == null
                ? pointScores.findByAssessmentId(assessmentId)
                : freshReport.points();
        for (Object row : pointRows) {
            String name; String dimension; Double score; String status; boolean lit;
            if (row instanceof EngineService.ReportPoint p) {
                name = p.name(); dimension = p.dimension();
                score = p.theta() == null ? null : 100.0 * p.theta();
                lit = Boolean.TRUE.equals(p.lit());
                status = (lit || (score != null && score >= 75)) ? "mastered"
                        : (score != null && score > 0 ? "learning" : "locked");
            } else if (row instanceof AssessmentPointScore ps) {
                name = ps.getAssessmentPoint(); dimension = ps.getDimension();
                score = ps.getScore();
                lit = score != null && score >= 75;
                status = lit ? "mastered" : (score != null && score > 0 ? "learning" : "locked");
            } else {
                continue;
            }
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("name", name); view.put("assessmentPoint", name);
            view.put("dimension", dimension);
            view.put("score", score == null ? null : Math.round(score * 100.0) / 100.0);
            view.put("status", status);
            view.put("lit", lit);
            skillTree.add(view);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("assessment", assessmentView(assessment));
        data.put("questions", questions.stream().map(this::snapshotView).toList());
        data.put("answers", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .map(this::answerView).toList());
        data.put("dimensions", dimViews);
        data.put("beforeDimensions", beforeViews);
        data.put("skillTree", skillTree);
        data.put("advice", assessment.getAdvice());
        data.put("hasScoringFailure", assessments.findByAssessmentQuestionIdIn(questionIds).stream()
                .anyMatch(a -> "scoring_failed".equals(a.getResultStatus())));
        return data;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parseReportAdvice(String advice) {
        if (advice == null || advice.isBlank()) return null;
        try {
            Object v = mapper.readValue(advice, Object.class);
            return v instanceof Map ? (Map<String, Object>) v : null;
        } catch (Exception e) {
            return null;
        }
    }'''
s2 = s2.replace(old_result, new_result, 1)
io.open(P2, 'w', encoding='utf-8', newline='').write(s2)
print('AssessmentAgentService result() enhanced:', len(s2) - len(old_result) - len(s2) + len(s2), 'OK')
