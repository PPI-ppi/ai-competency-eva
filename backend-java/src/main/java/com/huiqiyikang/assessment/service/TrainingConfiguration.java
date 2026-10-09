package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.Question;
import java.util.List;

public record TrainingConfiguration(List<String> modes, Integer difficulty) {
    public void validate() {
        if (modes == null || modes.isEmpty() || modes.stream().anyMatch(mode -> mode == null || !List.of("DIALOGUE","PRACTICAL","OBJECTIVE").contains(mode)))
            throw new BusinessException("请选择有效训练模式");
        if (difficulty != null && (difficulty < 1 || difficulty > 5)) throw new BusinessException("训练难度必须为 L1–L5");
    }
    public boolean accepts(Question q) {
        if (!"active".equals(q.getStatus()) || !"training".equals(q.getQuestionKind())) return false;
        if (difficulty != null && !difficulty.equals(q.getDifficulty())) return false;
        String type = q.getType();
        if (type == null) return false;
        return modes.contains(type) || modes.contains("OBJECTIVE") && List.of("SINGLE","SINGLE_CHOICE","MULTIPLE","MULTIPLE_CHOICE","TRUE_FALSE").contains(type);
    }
    public static TrainingConfiguration read(String json, ObjectMapper mapper) {
        if (json == null || json.isBlank()) return null;
        try {var config=mapper.readValue(json,TrainingConfiguration.class);config.validate();return config;}
        catch (Exception error) {throw new BusinessException("训练配置无效，请重新创建训练");}
    }
}
