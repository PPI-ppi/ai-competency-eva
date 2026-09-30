package com.huiqiyikang.assessment.controller;

import cn.dev33.satoken.stp.StpUtil;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.ApiResponse;
import com.huiqiyikang.assessment.common.BusinessException;
import com.huiqiyikang.assessment.common.RateLimiter;
import com.huiqiyikang.assessment.domain.AiAssessmentPoint;
import com.huiqiyikang.assessment.domain.AiDimension;
import com.huiqiyikang.assessment.entity.*;
import com.huiqiyikang.assessment.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/classes")
public class ClassRoomController {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ClassRoomController.class);
    private final ClassRoomService classes;
    private final ClassRoomService members;
    private final ClassRoomService codes;
    private final ClassRoomService classQuestions;
    private final QuestionService questions;
    private final AccountService students;
    private final AccountService teachers;
    private final AbilityService abilities;
    private final ObjectMapper mapper;
    private final RateLimiter limiter;
    private final LlmClient llm;
    private final SecureRandom random = new SecureRandom();

    public ClassRoomController(ClassRoomService c, ClassRoomService m, ClassRoomService i,
                               ClassRoomService q, QuestionService questions, AccountService s,
                               AccountService t, AbilityService abilities, ObjectMapper mapper,
                               RateLimiter limiter, LlmClient llm) {
        classes = c;
        members = m;
        codes = i;
        classQuestions = q;
        this.questions = questions;
        students = s;
        teachers = t;
        this.abilities = abilities;
        this.mapper = mapper;
        this.limiter = limiter;
        this.llm = llm;
    }

    public record Create(@NotBlank String name, String description, Map<String, Integer> pointWeights,
                         List<Map<String, Object>> assessmentPointWeights) {}

    @PostMapping
    public ApiResponse<?> create(@Valid @RequestBody Create request) {
        Long userId = uid();
        if (!teachers.existsByUserId(userId)) throw new BusinessException("只有教师可以创建班级");
        Map<String, Integer> weights = resolveCreateWeights(request);
        validatePointWeights(weights);
        ClassRoom classroom = new ClassRoom(userId, request.name(), request.description());
        classroom.setPointWeights(writePointWeights(weights));
        ClassRoom saved = classes.save(classroom);
        ClassInviteCode inviteCode = newInviteCode(saved.getId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("name", saved.getName());
        result.put("description", Optional.ofNullable(saved.getDescription()).orElse(""));
        result.put("pointWeights", weights);
        result.put("inviteCode", inviteCode.getCode());
        return ApiResponse.ok(result);
    }

    /**
     * 兼容两种创建组织契约：
     *  - 仓库前端/老契约：pointWeights（Map<考察点, 0-10整数>）
     *  - v9 前端：assessmentPointWeights（[{dimension, assessmentPoint, weight: 0-1小数}]，百分比合计100换算成0-10整数）
     */
    private Map<String, Integer> resolveCreateWeights(Create request) {
        Map<String, Integer> weights = new LinkedHashMap<>();
        if (request.pointWeights() != null) weights.putAll(request.pointWeights());
        if (request.assessmentPointWeights() != null) {
            for (Map<String, Object> item : request.assessmentPointWeights()) {
                Object pointObj = item.get("assessmentPoint");
                Object weightObj = item.get("weight");
                if (pointObj == null || weightObj == null) continue;
                String point = String.valueOf(pointObj).trim();
                double w = Double.parseDouble(String.valueOf(weightObj));
                weights.put(point, (int) Math.round(w * 10));
            }
        }
        return weights;
    }
    @GetMapping("/weight-support")
    public ApiResponse<?> weightSupport() {
        return ApiResponse.ok(Map.of("supported", true, "version", 1, "field", "pointWeights"));
    }

    @GetMapping("/managed")
    public ApiResponse<?> managed() {
        if (!teachers.existsByUserId(uid())) throw new BusinessException("当前账号不是教师");
        return ApiResponse.ok(classes.findByTeacherUserId(uid()));
    }

    @GetMapping("/joined")
    public ApiResponse<?> joined() {
        List<ClassMember> joined = members.findByStudentUserIdAndStatus(uid(), "active");
        if (joined.isEmpty()) return ApiResponse.ok(List.of());
        Map<Long, ClassRoom> byId = new HashMap<>();
        for (ClassRoom classroom : classes.findAllById(joined.stream().map(ClassMember::getClassId).toList())) {
            byId.put(classroom.getId(), classroom);
        }
        return ApiResponse.ok(joined.stream().map(member -> byId.get(member.getClassId()))
                .filter(Objects::nonNull).toList());
    }

    @GetMapping("/{id}/my-ability")
    public ApiResponse<?> myAbility(@PathVariable Long id) {
        if (!members.findByClassIdAndStudentUserId(id, uid())
                .map(member -> "active".equals(member.getStatus())).orElse(false)) {
            throw new BusinessException("不是该班级有效成员", HttpStatus.FORBIDDEN);
        }
        return ApiResponse.ok(abilities.myAbility(id, uid()));
    }

    @GetMapping("/{id}")
    public ApiResponse<?> detail(@PathVariable Long id) {
        ClassRoom classroom = classes.findById(id).orElseThrow(() -> new BusinessException("班级不存在"));
        if (!classroom.getTeacherUserId().equals(uid())
                && !members.findByClassIdAndStudentUserId(id, uid())
                .map(member -> "active".equals(member.getStatus())).orElse(false)) {
            throw new BusinessException("无权访问该班级");
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("classroom", classroom);
        data.put("pointWeights", readPointWeights(classroom.getPointWeights()));
        data.put("memberCount", members.memberCount(id));
        data.put("questionCount", classQuestions.questionCount(id));
        data.put("inviteCode", codes.findFirstByClassIdAndStatus(id, "active")
                .map(ClassInviteCode::getCode).orElse(null));
        return ApiResponse.ok(data);
    }

    @PostMapping("/join")
    @Transactional
    public ApiResponse<?> join(@RequestBody Map<String, String> body) {
        Long userId = uid();
        if (!limiter.allow("join:" + userId, 10, Duration.ofMinutes(1))) {
            throw new BusinessException("尝试过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
        }
        String input = body.getOrDefault("inviteCode", "").trim().toUpperCase();
        ClassInviteCode code = codes.findByCodeAndStatus(input, "active")
                .orElseThrow(() -> new BusinessException("邀请码无效或已失效"));
        if (!students.existsByUserId(userId)) throw new BusinessException("当前账号不是学生");
        ClassMember member = members.findByClassIdAndStudentUserId(code.getClassId(), userId).orElse(null);
        if (member != null && "active".equals(member.getStatus())) throw new BusinessException("已加入该班级");
        if (member == null) {
            members.save(new ClassMember(code.getClassId(), userId));
        } else {
            member.setStatus("active");
            member.setLeftAt(null);
            member.setRemovedAt(null);
            members.save(member);
        }
        return ApiResponse.ok(classes.findById(code.getClassId()).orElseThrow());
    }

    @DeleteMapping("/{id}/leave")
    public ApiResponse<Void> leave(@PathVariable Long id) {
        ClassMember member = members.findByClassIdAndStudentUserId(id, uid())
                .orElseThrow(() -> new BusinessException("不是该班级成员"));
        member.setStatus("left");
        member.setLeftAt(Instant.now());
        members.save(member);
        return ApiResponse.ok();
    }

    @GetMapping("/{id}/members")
    public ApiResponse<?> memberList(@PathVariable Long id) {
        owned(id);
        List<ClassMember> rows = members.findByClassIdAndStatus(id, "active");
        if (rows.isEmpty()) return ApiResponse.ok(List.of());
        Map<Long, User> byId = new HashMap<>();
        for (User user : students.findAllById(rows.stream().map(ClassMember::getStudentUserId).toList())) {
            byId.put(user.getId(), user);
        }
        return ApiResponse.ok(rows.stream().map(row -> memberView(row, byId.get(row.getStudentUserId()))).toList());
    }

    private Map<String, Object> memberView(ClassMember member, User user) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", member.getId());
        data.put("studentUserId", member.getStudentUserId());
        data.put("nickname", user == null ? null : user.getNickname());
        data.put("name", user == null ? null : user.getName());
        data.put("account", user == null ? null : user.getUsername());
        data.put("joinedAt", member.getJoinedAt());
        return data;
    }

    @DeleteMapping("/{id}/members/{studentId}")
    public ApiResponse<Void> removeMember(@PathVariable Long id, @PathVariable Long studentId) {
        owned(id);
        ClassMember member = members.findByClassIdAndStudentUserId(id, studentId)
                .orElseThrow(() -> new BusinessException("成员不存在"));
        member.setStatus("removed");
        member.setRemovedAt(Instant.now());
        members.save(member);
        return ApiResponse.ok();
    }

    @PostMapping("/{id}/invite-code")
    public ApiResponse<?> refresh(@PathVariable Long id) {
        owned(id);
        codes.findFirstByClassIdAndStatus(id, "active").ifPresent(old -> {
            old.setStatus("invalidated");
            old.setInvalidatedAt(Instant.now());
            codes.save(old);
        });
        return ApiResponse.ok(newInviteCode(id));
    }

    @GetMapping("/{id}/questions")
    public ApiResponse<?> classQuestions(@PathVariable Long id) {
        owned(id);
        List<ClassQuestion> links = classQuestions.findQuestions(id, "active");
        if (links.isEmpty()) return ApiResponse.ok(List.of());
        Map<Long, Question> byId = new HashMap<>();
        for (Question question : questions.findAllById(links.stream().map(ClassQuestion::getQuestionId).toList())) {
            byId.put(question.getId(), question);
        }
        return ApiResponse.ok(links.stream().map(link -> byId.get(link.getQuestionId()))
                .filter(Objects::nonNull).toList());
    }

    @PostMapping("/{id}/questions/{questionId}")
    public ApiResponse<?> addQuestion(@PathVariable Long id, @PathVariable Long questionId) {
        owned(id);
        Question question = questions.findById(questionId)
                .orElseThrow(() -> new BusinessException("题目不存在"));
        if (!question.getOwnerUserId().equals(uid())) throw new BusinessException("只能添加自己拥有的题目");
        if (!"active".equals(question.getStatus())) throw new BusinessException("下线题目不能加入班级");
        ClassQuestion link = classQuestions.findByClassIdAndQuestionId(id, questionId).orElse(null);
        if (link == null) link = new ClassQuestion(id, questionId);
        link.setStatus("active");
        link.setRemovedAt(null);
        classQuestions.save(link);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("classQuestion", link);
        result.put("trainingStatus", "success");
        result.put("trainingMessage", "");
        // 加入测试题库时同步生成一道 AI 训练变体（v9 前端期望训练题库里有它）。
        // 失败不再静默吞掉：把 trainingStatus 置为 failed 交给前端提示，并记日志。
        try {
            Question train = generateTrainingQuestion(id, question, "");
            result.put("trainingQuestionId", train.getId());
        } catch (Exception e) {
            log.warn("addQuestion training generation failed, classId={} questionId={}: {}",
                    id, questionId, e.toString());
            result.put("trainingStatus", "failed");
            result.put("trainingMessage", "AI 训练题生成失败：" + (e.getMessage() == null ? "未知错误" : e.getMessage()));
        }
        return ApiResponse.ok(result);
    }

    /**
     * AI 变题：基于班级已有题目生成一道训练变体，并写入 class_questions 关联，
     * 训练题库（按 class_questions + question_kind='training' 过滤）才能查到它。
     */
    @PostMapping("/{id}/questions/{questionId}/generate-training")
    public ApiResponse<?> generateTraining(@PathVariable Long id, @PathVariable Long questionId) {
        owned(id);
        Question question = questions.findById(questionId)
                .orElseThrow(() -> new BusinessException("题目不存在"));
        if (!question.getOwnerUserId().equals(uid())) throw new BusinessException("只能基于自己拥有的题目生成训练变体");
        Question train = generateTrainingQuestion(id, question, "");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", train.getId());
        result.put("questionId", train.getId());
        result.put("type", train.getType());
        result.put("title", train.getTitle());
        result.put("content", train.getContent());
        result.put("sourceQuestionId", question.getId());
        result.put("trainingStatus", "success");
        return ApiResponse.ok(result);
    }

    /** 生成并落库一道训练题，同时建立班级关联。 */
    private Question generateTrainingQuestion(Long classId, Question question, String instruction) {
        LlmClient.GeneratedQuestion gen = llm.generateSimilarQuestion(
                new LlmClient.QuestionContext(question.getId(), question.getType(), question.getTitle(),
                    question.getContent(), question.getOptions(), question.getAnswer(), question.getRubric()),
                instruction, parseList(question.getTags()), parseList(question.getAssessmentPoints()),
                question.getDifficulty());
        Question train = new Question();
        train.setOwnerUserId(question.getOwnerUserId());
        train.setType(gen.type() == null || gen.type().isBlank() ? question.getType() : gen.type());
        train.setTitle(gen.title());
        train.setContent(gen.content());
        train.setOptions(gen.options());
        train.setAnswer(gen.answer());
        train.setRubric(gen.rubric());
        train.setTags(writeJson(gen.tags()));
        train.setAssessmentPoints(writeJson(gen.assessmentPoints()));
        train.setDifficulty(gen.difficulty() == null ? question.getDifficulty() : gen.difficulty());
        train.setScore(100);
        train.setVisibility("public");
        train.setStatus("active");
        train.setQuestionKind("training");
        train.setSourceQuestionId(question.getId());
        Question saved = questions.save(train);
        ClassQuestion link = classQuestions.findByClassIdAndQuestionId(classId, saved.getId()).orElse(null);
        if (link == null) link = new ClassQuestion(classId, saved.getId());
        link.setStatus("active");
        link.setRemovedAt(null);
        classQuestions.save(link);
        return saved;
    }

    /** 列表字段序列化：失败落空数组，不让一次坏数据阻塞整个变题流程。 */
    private String writeJson(List<String> values) {
        if (values == null) return "[]";
        try {
            return mapper.writeValueAsString(values);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    /** 分类题库（测试/训练）移除题目：软删班级关联。 */
    @DeleteMapping("/{id}/question-banks/{bankType}/questions/{questionId}")
    public ApiResponse<Void> removeClassifiedQuestion(@PathVariable Long id, @PathVariable String bankType,
                                                      @PathVariable Long questionId) {
        owned(id);
        ClassQuestion link = classQuestions.findByClassIdAndQuestionId(id, questionId)
                .orElseThrow(() -> new BusinessException("班级中不存在该题目"));
        link.setStatus("removed");
        link.setRemovedAt(Instant.now());
        classQuestions.save(link);
        return ApiResponse.ok();
    }

    @DeleteMapping("/{id}/questions/{questionId}")
    public ApiResponse<Void> removeQuestion(@PathVariable Long id, @PathVariable Long questionId) {
        owned(id);
        ClassQuestion link = classQuestions.findByClassIdAndQuestionId(id, questionId)
                .orElseThrow(() -> new BusinessException("班级中不存在该题目"));
        link.setStatus("removed");
        link.setRemovedAt(Instant.now());
        classQuestions.save(link);
        return ApiResponse.ok();
    }

        @SuppressWarnings("unchecked")
    private List<String> parseList(String json) {
        if (json == null || json.isBlank()) return List.of();
        try { return mapper.readValue(json, List.class); }
        catch (Exception e) { return List.of(); }
    }

    private Long uid() {
        return StpUtil.getLoginIdAsLong();
    }

    private void owned(Long id) {
        ClassRoom classroom = classes.findById(id)
                .orElseThrow(() -> new BusinessException("班级不存在", HttpStatus.NOT_FOUND));
        if (!classroom.getTeacherUserId().equals(uid())) {
            throw new BusinessException("无权操作该班级", HttpStatus.FORBIDDEN);
        }
    }

    private void validatePointWeights(Map<String, Integer> weights) {
        if (weights == null || weights.isEmpty()) {
            throw new BusinessException("请至少配置一个考察点权重");
        }
        for (Map.Entry<String, Integer> entry : weights.entrySet()) {
            String point = entry.getKey();
            Integer w = entry.getValue();
            if (point == null || point.isBlank() || w == null) {
                throw new BusinessException("考察点权重不完整");
            }
            if (w < 0 || w > 10) {
                throw new BusinessException("权重必须是 0-10 的整数：" + point);
            }
            AiAssessmentPoint knownPoint = AiAssessmentPoint.byLabel(point.trim())
                    .orElseThrow(() -> new BusinessException("考察点不存在：" + point));
        }
    }

    private String writePointWeights(Map<String, Integer> weights) {
        if (weights == null || weights.isEmpty()) return null;
        try {
            return mapper.writeValueAsString(weights);
        } catch (JsonProcessingException e) {
            throw new BusinessException("考察点权重格式错误");
        }
    }

    private Object readPointWeights(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return mapper.readValue(value, Object.class);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 8;

    private String newCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        }
        return code.toString();
    }

    private ClassInviteCode newInviteCode(Long classId) {
        for (int attempt = 0; attempt < 10; attempt++) {
            String code = newCode();
            if (codes.findByCode(code).isPresent()) continue;
            try {
                return codes.save(new ClassInviteCode(classId, code));
            } catch (DataIntegrityViolationException ignored) {
                // 并发生成邀请码时，下一次循环重试。
            }
        }
        throw new BusinessException("邀请码生成失败，请重试");
    }
}
