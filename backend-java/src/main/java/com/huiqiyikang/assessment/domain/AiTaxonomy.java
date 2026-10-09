package com.huiqiyikang.assessment.domain;

import java.util.List;

/**
 * 维度与考察点的统一校验入口。
 *
 * 三处用到同一套规则，所以只写一遍：出题、教师发布任务、学生开始自主测评。
 * 空集合表示"不限制范围"，退回使用班级全部题库。
 */
public final class AiTaxonomy {
    private AiTaxonomy() {
    }

    public static final List<String> TOOL_SCENARIOS = List.of("文本写作","图像生成","视频制作","音频处理","设计辅助","办公与写作","编程开发","数据分析与商业智能");
    public static String basePoint(String label) {
        if(label==null)return "";
        for(String scene:TOOL_SCENARIOS) if(label.endsWith("-"+scene))return label.substring(0,label.length()-scene.length()-1);
        return label;
    }
    public static AiDimension dimensionOf(String label) {
        AiAssessmentPoint point=AiAssessmentPoint.byLabel(basePoint(label)).orElseThrow(()->new IllegalArgumentException("考察点不存在："+label));
        if(!label.equals(point.label()) && (point.dimension()!=AiDimension.AI_TOOL_USAGE || !TOOL_SCENARIOS.stream().anyMatch(s->label.equals(point.label()+"-"+s))))throw new IllegalArgumentException("能力项不存在："+label);
        return point.dimension();
    }
    public static List<java.util.Map<String,Object>> pointDefinitions(AiDimension dimension) {
        java.util.List<java.util.Map<String,Object>> result=new java.util.ArrayList<>();
        for(AiAssessmentPoint point:AiAssessmentPoint.of(dimension)) {
            if(dimension!=AiDimension.AI_TOOL_USAGE) {result.add(definition(point.label(),point.label(),"",point.description()));continue;}
            for(String scene:TOOL_SCENARIOS) {
                String description=java.util.Arrays.stream(point.description().split("\\n")).filter(line->line.startsWith(scene+"：")).findFirst().map(line->line.substring(scene.length()+1)).orElse(point.description());
                result.add(definition(point.label()+"-"+scene,point.label(),scene,description));
            }
        }
        return result;
    }
    private static java.util.Map<String,Object> definition(String name,String base,String scenario,String description) {
        java.util.Map<String,Object> value=new java.util.LinkedHashMap<>();value.put("name",name);value.put("baseName",base);value.put("scenario",scenario);value.put("description",description);value.put("available",true);return value;
    }

    /** 校验失败抛 {@link IllegalArgumentException}，消息可直接展示给用户。 */
    public static void validate(List<String> dimensions, List<String> points) {
        if (dimensions == null || dimensions.isEmpty()) {
            if (points != null && !points.isEmpty()) throw new IllegalArgumentException("请先选择维度，再选择考察点");
            return;
        }
        List<AiDimension> known = dimensions.stream()
                .map(d -> AiDimension.byLabel(d).orElseThrow(() -> new IllegalArgumentException("维度不在固定分类内：" + d)))
                .toList();
        if (points == null) return;
        for (String label : points) {
            AiDimension dimension=dimensionOf(label);
            if (!known.contains(dimension)) throw new IllegalArgumentException("考察点「" + label + "」不属于所选维度");
        }
    }
}
