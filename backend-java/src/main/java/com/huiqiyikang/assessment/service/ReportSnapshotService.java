package com.huiqiyikang.assessment.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.huiqiyikang.assessment.domain.*;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

/** One immutable report per completed assessment; no live profile substitution. */
@Service
public class ReportSnapshotService {
    private final AssessmentRepository assessments;
    private final AssessmentDimensionScoreRepository dimensions;
    private final AssessmentQuestionRepository questions;
    private final AssessmentAnswerRepository answers;
    private final AssessmentMessageRepository messages;
    private final GrowthService growth;
    private final LlmClient llm;
    private final AbilityLevelScale levels;
    private final AssessmentTaskRepository tasks;
    public ReportSnapshotService(AssessmentRepository a,AssessmentDimensionScoreRepository d,
        AssessmentQuestionRepository q,AssessmentAnswerRepository an,AssessmentMessageRepository m,GrowthService g,LlmClient l,AbilityLevelScale scale,AssessmentTaskRepository t){
        assessments=a;dimensions=d;questions=q;answers=an;messages=m;growth=g;llm=l;levels=scale;tasks=t;
    }
    @Transactional
    @SuppressWarnings("unchecked")
    public Map<String,Object> freeze(Long assessmentId) {
        Assessment a=assessments.selectOne(new QueryWrapper<Assessment>().eq("id",assessmentId).last("FOR UPDATE"));
        if(a==null)throw new IllegalArgumentException("测评不存在");
        if(a.getReportSnapshotJson()!=null)return growth.decode(a.getReportSnapshotJson());
        if(!AssessmentRepository.COMPLETED_STATUSES.contains(a.getStatus()))throw new IllegalStateException("测评尚未完成");
        Map<String,Object> before=growth.decode(a.getBeforeProfileJson());
        Map<String,Object> after=growth.profileAt(a.getClassId(),a.getStudentUserId(),a.getCompletedAt(),a.getId());
        List<AssessmentQuestion> qs=questions.findByAssessmentIdOrderBySequenceNo(assessmentId);
        List<Map<String,Object>> evidence=new ArrayList<>();
        for(AssessmentQuestion q:qs){Map<String,Object> row=new LinkedHashMap<>();row.put("question",q);
            row.put("answer",answers.findByAssessmentQuestionId(q.getId()).orElse(null));
            row.put("dialogue",messages.findByAssessmentQuestionIdOrderBySequenceNo(q.getId()));evidence.add(row);}
        List<AssessmentDimensionScore> ds=dimensions.findByAssessmentId(assessmentId);
        Map<String,Object> input=new LinkedHashMap<>();input.put("score",a.getAverageScore());input.put("dimensions",ds);input.put("evidence",evidence);
        Map<String,Object> advice=growth.decode(a.getAdvice());String source="model";
        if(advice.isEmpty())try{advice=growth.decode(llm.report(growth.encode(input)));}catch(Exception e){source="rule";}
        String overall=String.valueOf(advice.getOrDefault("overall",""));
        if(overall.length()<200||overall.length()>300){source="rule";overall=fallbackAdvice(a,ds);}
        Map<String,Object> analysis=advice.get("dimensions") instanceof Map<?,?> m?(Map<String,Object>)m:Map.of();
        List<Map<String,Object>> current=new ArrayList<>();
        List<AssessmentAnswer> savedAnswers=new ArrayList<>();
        for(AssessmentQuestion q:qs)answers.findByAssessmentQuestionId(q.getId()).ifPresent(savedAnswers::add);
        for(AiDimension d:AiDimension.values()){
            AssessmentDimensionScore s=ds.stream().filter(x->d.label().equals(x.getDimension())).findFirst().orElse(null);
            boolean tested=s!=null&&s.getQuestionCount()!=null&&s.getQuestionCount()>0&&s.getScore()!=null;
            boolean attempted=qs.stream().anyMatch(q->d.label().equals(q.getDimensionName()));
            String status=tested?"scored":attempted&&qs.stream().filter(q->d.label().equals(q.getDimensionName())).anyMatch(q->answers.findByAssessmentQuestionId(q.getId()).map(x->"scoring_failed".equals(x.getResultStatus())).orElse(false))?"scoring_failed":"unassessed";
            Map<String,Object> row=new LinkedHashMap<>();row.put("dimension",d.label());row.put("name",d.label());row.put("score",tested?s.getScore():null);row.put("tested",tested);row.put("status",status);
            row.put("analysis",tested?analysisText(analysis.get(d.label()),"本次该维度得分为"+s.getScore()+"分。请结合本次题目与评分依据复盘，并针对薄弱考察点练习。"):"scoring_failed".equals(status)?"评分失败":"未考察");current.add(row);
        }
        List<Map<String,Object>> skills=(List<Map<String,Object>>)after.get("points");
        List<Map<String,Object>> previous=before.get("points") instanceof List<?> l?(List<Map<String,Object>>)l:List.of();
        List<Map<String,Object>> newly=new ArrayList<>();
        for(Map<String,Object> skill:skills){boolean was=previous.stream().anyMatch(p->Objects.equals(p.get("name"),skill.get("name"))&&Boolean.TRUE.equals(p.get("lit")));
            boolean isNew=!before.isEmpty()&&Boolean.TRUE.equals(skill.get("lit"))&&!was;skill.put("newlyLit",isNew);if(isNew)newly.add(skill);}
        Map<String,Object> result=new LinkedHashMap<>();result.put("id",a.getId());result.put("assessmentId",a.getId());result.put("classId",a.getClassId());result.put("studentUserId",a.getStudentUserId());
        result.put("reportType",a.getTaskId()!=null?"TASK":a.getReportType());result.put("status",a.getStatus());result.put("completedAt",a.getCompletedAt());
        result.put("score",a.getAverageScore());result.put("abilityLevel",levels.of(a.getAverageScore()).code());
        result.put("title",a.getTaskId()!=null?tasks.findById(a.getTaskId()).map(AssessmentTask::getTitle).orElse("组织任务报告"):"TRAINING".equals(a.getReportType())?"自定义训练":"自主能力测评");
        result.put("dimensions",current);result.put("beforeDimensions",before.getOrDefault("dimensions",List.of()));result.put("afterDimensions",after.get("dimensions"));
        result.put("abilityBefore",before);result.put("abilityAfter",after);result.put("skillTree",skills);result.put("newlyLitSkills",newly);
        result.put("aiAdvice",overall);result.put("advice",overall);result.put("analysisSource",source);
        result.put("suggestions",advice.getOrDefault("suggestions",List.of("围绕已评估的薄弱考察点开展练习","复盘作答与评分依据，比较改进后的结果")));
        result.put("pointAnalysis",evidence.stream().map(e->{AssessmentQuestion q=(AssessmentQuestion)e.get("question");AssessmentAnswer answer=(AssessmentAnswer)e.get("answer");Map<String,Object> r=new LinkedHashMap<>();r.put("name",q.getPointName());r.put("score",answer==null?null:answer.getScore());r.put("comment",answer==null?"未获得有效评分":answer.getScoringReason());return r;}).toList());
        result.put("beforeSnapshotAvailable",!before.isEmpty());result.put("snapshotVersion",1);
        a.setAdvice(growth.encode(advice));a.setReportSnapshotJson(growth.encode(result));assessments.save(a);return result;
    }
    private String analysisText(Object value,String fallback){
        if(value instanceof String text && !text.isBlank())return text.replace("未测准","未考察");
        if(value instanceof Map<?,?> map){for(String key:List.of("analysis","text","content")){if(map.get(key) instanceof String text && !text.isBlank())return text;}}
        return fallback;
    }
    private String fallbackAdvice(Assessment a,List<AssessmentDimensionScore> dims){
        String names=dims.stream().filter(d->d.getQuestionCount()!=null&&d.getQuestionCount()>0&&d.getScore()!=null).sorted(Comparator.comparing(AssessmentDimensionScore::getScore)).map(AssessmentDimensionScore::getDimension).findFirst().orElse("尚未形成有效评分的能力");
        return "本次作答的有效综合评分为"+(a.getAverageScore()==null?"暂无":a.getAverageScore()+"分")+"。建议优先围绕“"+names+"”复盘：对照题目要求检查自己的答案、对话和最终方案，找出评分依据中提到的遗漏，再用同一任务尝试一次改进。练习时明确目标、背景、约束和输出格式，保留每轮修改的理由，并主动核验事实、隐私及版权风险。未考察的维度暂不作能力结论，也不按零分评价；可以在后续选择相关考察点补充测评。持续比较改进前后的实际结果，逐步积累可复核的能力证据。当前文字依据已保存评分生成，详细表现以本次逐题评分与六维分析为准。";
    }
}
