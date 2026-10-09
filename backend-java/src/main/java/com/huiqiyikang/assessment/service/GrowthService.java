package com.huiqiyikang.assessment.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.domain.*;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.*;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.*;

/** Cumulative, organization-scoped ability. Missing observations are never scores. */
@Service
public class GrowthService {
    private final AssessmentRepository assessments;
    private final AssessmentPointScoreRepository scores;
    private final AssessmentPointStateRepository states;
    private final ClassRoomRepository classes;
    private final ClassMemberRepository members;
    private final ObjectMapper json;
    private final AbilityLevelScale levels;
    public GrowthService(AssessmentRepository a, AssessmentPointScoreRepository p,
                         ClassRoomRepository c, ClassMemberRepository m, ObjectMapper j, AbilityLevelScale l, AssessmentPointStateRepository s) {
        assessments=a; scores=p; classes=c; members=m; json=j; levels=l; states=s;
    }
    public Map<String,Object> profile(Long classId, Long studentId) {
        return profileAt(classId,studentId,null,null);
    }
    public Map<String,Object> profileAt(Long classId, Long studentId, Instant completedAt, Long boundaryId) {
        QueryWrapper<Assessment> query=new QueryWrapper<Assessment>()
            .eq("class_id",classId).eq("student_user_id",studentId)
            .in("status",AssessmentRepository.COMPLETED_STATUSES)
            .orderByDesc("completed_at").orderByDesc("id");
        if(completedAt!=null)query.and(q->q.lt("completed_at",completedAt).or(n->n.eq("completed_at",completedAt).le("id",boundaryId)));
        List<Assessment> history=assessments.selectList(query);
        List<AssessmentPointScore> observations=history.isEmpty()?List.of():scores.selectList(
            new QueryWrapper<AssessmentPointScore>().in("assessment_id",history.stream().map(Assessment::getId).toList()));
        // Reconstruct from immutable per-assessment evidence, not the legacy average-score cache.
        // This also permits exact historical boundaries without rewriting saved reports.
        Instant reference=completedAt==null?Instant.now():completedAt;
        Map<Long,Assessment> completed=new HashMap<>();
        for(Assessment a:history)if(a.getCompletedAt()!=null&&!a.getCompletedAt().isAfter(reference)
            && (boundaryId==null||!a.getCompletedAt().equals(reference)||a.getId()<=boundaryId))completed.put(a.getId(),a);
        List<AssessmentPointState> raw=completed.isEmpty()?List.of():states.selectList(
            new QueryWrapper<AssessmentPointState>().in("assessment_id",completed.keySet()).orderByDesc("updated_at").orderByDesc("id"));
        Map<String,List<AssessmentPointState>> byPoint=new LinkedHashMap<>();
        Set<String> seen=new HashSet<>();
        for(AssessmentPointState p:raw)if(completed.containsKey(p.getAssessmentId())
            && ProfileMath.valid(p.getTheta(),p.getConfidence(),p.getAnswerCount())
            && seen.add(p.getAssessmentId()+":"+p.getAssessmentPoint()))
            byPoint.computeIfAbsent(p.getAssessmentPoint(),k->new ArrayList<>()).add(p);
        Set<String> legacyPoints=new HashSet<>();
        for(AssessmentPointScore p:observations)if(p.getScore()!=null&&p.getQuestionCount()!=null&&p.getQuestionCount()>0)legacyPoints.add(p.getAssessmentPoint());
        Map<String,Double> weights=weights(classes.findById(classId).map(ClassRoom::getPointWeights).orElse(null));
        List<Map<String,Object>> points=new ArrayList<>(), dims=new ArrayList<>();
        double sum=0, totalWeight=0;
        for(AiDimension d:AiDimension.values()) {
            double dimSum=0, dimWeight=0;
            List<Map<String,Object>> definitions=new ArrayList<>(AiTaxonomy.pointDefinitions(d));
            // Legacy observations belong to a parent point, never to all eight scenarios.
            if(d==AiDimension.AI_TOOL_USAGE)for(AiAssessmentPoint parent:AiAssessmentPoint.of(d))if(byPoint.containsKey(parent.label())) {
                Map<String,Object> legacy=new LinkedHashMap<>();legacy.put("name",parent.label());legacy.put("baseName",parent.label());legacy.put("scenario","");legacy.put("legacy",true);definitions.add(legacy);
            }
            for(Map<String,Object> definition:definitions) {
                String name=(String)definition.get("name");
                List<AssessmentPointState> values=byPoint.getOrDefault(name,List.of());
                Instant newest=values.stream().map(p->completed.get(p.getAssessmentId()).getCompletedAt()).max(Instant::compareTo).orElse(reference);
                double weighted=0,evidence=0;
                for(AssessmentPointState p:values){
                    double days=java.time.Duration.between(completed.get(p.getAssessmentId()).getCompletedAt(),newest).toSeconds()/86400.0;
                    double w=p.getConfidence()*ProfileMath.decay(days);weighted+=w*p.getTheta();evidence+=w;
                }
                Double ability=evidence>0?weighted/evidence:null;
                Double score=ability==null?null:round(ability*100);
                double weight=weights.getOrDefault(name,weights.isEmpty()?1.0:0.0);
                Map<String,Object> point=new LinkedHashMap<>(definition);
                point.put("dimension",d.label()); point.put("assessmentPoint",name);
                point.put("score",score); point.put("questionCount",values.size());
                boolean lit=ability!=null&&weight>0&&ability>=ProfileMath.skillThreshold(weight);
                point.put("status",score==null?"unassessed":lit?"mastered":"learning");
                point.put("lit",lit);point.put("threshold",round(ProfileMath.skillThreshold(weight)*100));
                point.put("evidenceWeight",evidence*ProfileMath.decay(java.time.Duration.between(newest,reference).toSeconds()/86400.0));
                point.put("evidenceStatus",values.isEmpty()?legacyPoints.contains(name)?"missing_confidence":"unassessed":java.time.Duration.between(newest,reference).toDays()>=30?"aging":"current");
                point.put("lastEvaluatedAt",values.isEmpty()?null:newest);points.add(point);
                if(ability!=null&&weight>0){dimSum+=ability*100;dimWeight+=1;sum+=ability*100*weight;totalWeight+=weight;}
            }
            Map<String,Object> dim=new LinkedHashMap<>(); dim.put("dimension",d.label());dim.put("name",d.label());
            dim.put("score",dimWeight==0?null:round(dimSum/dimWeight));dim.put("tested",dimWeight>0);dims.add(dim);
        }
        Double score=totalWeight==0?null:round(sum/totalWeight);
        Map<String,Object> summary=new LinkedHashMap<>(); summary.put("averageScore",score);
        summary.put("level",levels.of(score).code());summary.put("levelName",levels.of(score).name());
        summary.put("completedAt",history.isEmpty()?null:history.get(0).getCompletedAt());
        Map<String,Object> result=new LinkedHashMap<>(); result.put("classId",classId);
        result.put("hasAssessment",score!=null);result.put("latest",summary);
        result.put("dimensions",dims);result.put("points",points);result.put("skillTree",points);
        result.put("algorithm","confidence-decay-30d-v2");
        result.put("halfLifeDays",30);result.put("skillWeightScale",10);
        result.put("agingPointCount",points.stream().filter(p->"aging".equals(p.get("evidenceStatus"))).count());
        result.put("missingEvidencePointCount",points.stream().filter(p->"missing_confidence".equals(p.get("evidenceStatus"))).count());
        result.put("recordCount",history.size());return result;
    }
    @SuppressWarnings("unchecked")
    public Map<String,Object> average(Long classId) {
        List<ClassMember> active=members.findByClassIdAndStatus(classId,"active");
        double total=0; int assessed=0;
        Map<String,Double> sums=new LinkedHashMap<>(); Map<String,Integer> counts=new LinkedHashMap<>();
        for(AiDimension d:AiDimension.values()){sums.put(d.label(),0.0);counts.put(d.label(),0);}
        for(ClassMember m:active){Map<String,Object> p=profile(classId,m.getStudentUserId());
            Object s=((Map<String,Object>)p.get("latest")).get("averageScore");
            if(s instanceof Number n){total+=n.doubleValue();assessed++;}
            for(Map<String,Object> d:(List<Map<String,Object>>)p.get("dimensions")){
                String name=(String)d.get("dimension");if(d.get("score") instanceof Number n){sums.merge(name,n.doubleValue(),Double::sum);counts.merge(name,1,Integer::sum);}
            }
        }
        List<Map<String,Object>> dims=new ArrayList<>();for(String name:sums.keySet()){
            Map<String,Object> d=new LinkedHashMap<>();d.put("dimension",name);
            d.put("score",active.isEmpty()||counts.get(name)==0?null:round(sums.get(name)/active.size()));
            d.put("assessedCount",counts.get(name));dims.add(d);
        }
        Map<String,Object> result=new LinkedHashMap<>();result.put("memberCount",active.size());result.put("assessedCount",assessed);
        result.put("averageScore",active.isEmpty()||assessed==0?null:round(total/active.size()));
        result.put("dimensions",dims);result.put("calculatedAt",Instant.now());return result;
    }
    public String encode(Object value){try{return json.writeValueAsString(value);}catch(Exception e){throw new IllegalStateException(e);}}
    public Map<String,Object> decode(String value){try{return json.readValue(value,new TypeReference<Map<String,Object>>(){});}catch(Exception e){return new LinkedHashMap<>();}}
    private Map<String,Double> weights(String value){try{
        Map<String,Double> parsed=json.readValue(value,new TypeReference<Map<String,Double>>(){});
        if(parsed==null)return Map.of();
        parsed.replaceAll((k,v)->v==null||!Double.isFinite(v)||v<0?0.0:Math.min(10,v));return parsed;
    }catch(Exception e){return Map.of();}}
    private static double round(double x){return Math.round(x*100.0)/100.0;}
}
