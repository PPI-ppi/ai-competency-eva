package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.mapper.ClassQuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

/** 同一组织、同一原题最多复用一个有效训练变体；原题关联行锁串行化并发生成。 */
@Service
public class TrainingQuestionService {
    private final ClassQuestionRepository links;
    private final QuestionService questions;
    private final LlmClient llm;
    private final ObjectMapper mapper;

    public TrainingQuestionService(ClassQuestionRepository links, QuestionService questions,
                                   LlmClient llm, ObjectMapper mapper) {
        this.links = links; this.questions = questions; this.llm = llm; this.mapper = mapper;
    }

    @Transactional
    public Question ensureVariant(Long classId, Question source, String instruction) {
        if (!QuestionService.isActiveTest(source)) {
            throw new BusinessException("只能基于有效测试原题生成训练变体");
        }
        ClassQuestion original = links.lockSource(classId, source.getId());
        if (original == null || !"active".equals(original.getStatus())) {
            throw new BusinessException("请先将原题加入组织测试题库");
        }
        Question existing = links.findTrainingVariant(classId, source.getId());
        if (existing != null) {
            // 移出训练题后再次生成，恢复已存在的变体，不再创建同源副本。
            link(classId, existing.getId());
            return existing;
        }
        var generated = llm.generateSimilarQuestion(
                new LlmClient.QuestionContext(source.getId(), source.getType(), source.getTitle(),
                        source.getContent(), source.getOptions(), source.getAnswer(), source.getRubric()),
                instruction, parseList(source.getTags()), parseList(source.getAssessmentPoints()), source.getDifficulty());
        Question train = new Question();
        train.setOwnerUserId(source.getOwnerUserId());
        train.setType(generated.type() == null || generated.type().isBlank() ? source.getType() : generated.type());
        train.setTitle(generated.title()); train.setContent(generated.content());
        train.setOptions(generated.options()); train.setAnswer(generated.answer()); train.setRubric(generated.rubric());
        train.setTags(writeList(generated.tags())); train.setAssessmentPoints(writeList(generated.assessmentPoints()));
        train.setDifficulty(generated.difficulty() == null ? source.getDifficulty() : generated.difficulty());
        train.setScore(100); train.setVisibility("public"); train.setStatus("active");
        train.setQuestionKind("training"); train.setSourceQuestionId(source.getId());
        Question saved = questions.save(train);
        link(classId, saved.getId());
        return saved;
    }

    private void link(Long classId, Long questionId) {
        ClassQuestion link = links.findByClassIdAndQuestionId(classId, questionId)
                .orElseGet(() -> new ClassQuestion(classId, questionId));
        link.setStatus("active"); link.setRemovedAt(null);
        links.save(link);
    }

    private List<String> parseList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try { return mapper.readValue(json, new TypeReference<List<String>>() {}); }
        catch (Exception ignored) { return List.of(); }
    }

    private String writeList(List<String> values) {
        try { return mapper.writeValueAsString(values == null ? List.of() : values); }
        catch (Exception error) { throw new BusinessException("训练题分类数据保存失败"); }
    }
}
