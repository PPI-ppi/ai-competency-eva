package com.huiqiyikang.assessment.controller;
import com.huiqiyikang.assessment.domain.AiAssessmentPoint; import com.huiqiyikang.assessment.domain.AiDimension; import com.huiqiyikang.assessment.domain.AiTaxonomy;
import com.huiqiyikang.assessment.entity.Question; import com.huiqiyikang.assessment.service.AccountService; import com.huiqiyikang.assessment.service.QuestionService; import com.huiqiyikang.assessment.service.LlmClient;
import cn.dev33.satoken.stp.StpUtil; import com.fasterxml.jackson.core.JsonProcessingException; import com.fasterxml.jackson.databind.ObjectMapper; import com.huiqiyikang.assessment.common.*; import jakarta.validation.Valid; import jakarta.validation.constraints.*; import org.springframework.http.HttpStatus; import org.springframework.web.bind.annotation.*; import java.time.Instant; import java.util.*;
@RestController @RequestMapping("/api/questions") public class QuestionController {
 private final QuestionService repo; private final ObjectMapper mapper; private final AccountService accounts; private final LlmClient llm; public QuestionController(QuestionService r,ObjectMapper mapper,AccountService accounts,LlmClient llm){repo=r;this.mapper=mapper;this.accounts=accounts;this.llm=llm;}
 public record Request(@NotBlank String type,@NotBlank String title,@NotBlank String content,String options,String answer,String rubric,@Min(1) Integer difficulty,@NotEmpty List<String> tags,@NotEmpty List<String> assessmentPoints){}
 @GetMapping public ApiResponse<?> list(){return ApiResponse.ok(repo.findByOwnerUserIdAndStatus(StpUtil.getLoginIdAsLong(),"active"));}
 @GetMapping("/public") public ApiResponse<?> publicly(){return ApiResponse.ok(repo.findByVisibilityAndStatus("public","active").stream().map(this::publicView).toList());}
 @GetMapping("/training") public ApiResponse<?> training(){requireTeacher();return ApiResponse.ok(repo.trainingList().stream().map(this::publicView).toList());}
 /**
  * 固定分类词表：前端出题、发布任务、开始测评、AI 能力标准页都用它渲染，不允许自由输入。
  * points 从「字符串数组」升级为「{name, description} 数组」，描述来自《具体考察点2.0》。
  * 6 个维度共 20 个考察点；AI工具使用下的 8 个使用场景已经并入考察点介绍，不再单独出现。
  */
 @GetMapping("/taxonomy") public ApiResponse<?> taxonomy(){return ApiResponse.ok(java.util.Arrays.stream(AiDimension.values()).map(d->{java.util.Map<String,Object> item=new java.util.LinkedHashMap<>();item.put("dimension",d.label());item.put("description",d.description());item.put("points",AiTaxonomy.pointDefinitions(d));return item;}).toList());}
 @PostMapping public ApiResponse<?> create(@Valid @RequestBody Request r){requireTeacher();validate(r);Question q=new Question();q.setOwnerUserId(StpUtil.getLoginIdAsLong());apply(q,r);return ApiResponse.ok(repo.save(q));}
 @PostMapping("/{id}/generate-similar") public ApiResponse<?> generateSimilar(@PathVariable Long id,@RequestBody(required=false) GenerateRequest r){requireTeacher();Question source=owned(id);List<String> tags=list(source.getTags());List<String> points=list(source.getAssessmentPoints());String instruction=r==null?"":r.instruction();LlmClient.GeneratedQuestion generated=llm.generateSimilarQuestion(new LlmClient.QuestionContext(source.getId(),source.getType(),source.getTitle(),source.getContent(),source.getOptions(),source.getAnswer(),source.getRubric()),instruction,tags,points,source.getDifficulty());Request draft=new Request(source.getType(),generated.title(),generated.content(),generated.options(),generated.answer(),generated.rubric(),generated.difficulty(),tags,points);validate(draft);return ApiResponse.ok(draft);}
 @GetMapping("/{id}") public ApiResponse<?> detail(@PathVariable Long id){Question q=repo.findById(id).orElseThrow(()->new BusinessException("题目不存在"));if(Objects.equals(q.getOwnerUserId(),userId()))return ApiResponse.ok(q);if("public".equals(q.getVisibility())&&"active".equals(q.getStatus()))return ApiResponse.ok(accounts.existsTeacher(userId())?q:publicView(q));throw new BusinessException("无权查看该题目",HttpStatus.FORBIDDEN);}
 @PutMapping("/{id}") public ApiResponse<?> update(@PathVariable Long id,@Valid @RequestBody Request r){requireTeacher();validate(r);Question q=owned(id);apply(q,r);q.setUpdatedAt(Instant.now());return ApiResponse.ok(repo.save(q));}
 @PostMapping("/{id}/publish") public ApiResponse<?> publish(@PathVariable Long id){requireTeacher();Question q=owned(id);q.setVisibility("public");q.setUpdatedAt(Instant.now());return ApiResponse.ok(repo.save(q));}
 @PostMapping("/{id}/unpublish") public ApiResponse<?> unpublish(@PathVariable Long id){requireTeacher();Question q=owned(id);q.setVisibility("private");q.setUpdatedAt(Instant.now());return ApiResponse.ok(repo.save(q));}
 @PostMapping("/{id}/offline") public ApiResponse<?> offline(@PathVariable Long id){requireTeacher();Question q=owned(id);q.setStatus("offline");q.setUpdatedAt(Instant.now());return ApiResponse.ok(repo.save(q));}
 @PostMapping("/{id}/restore") public ApiResponse<?> restore(@PathVariable Long id){requireTeacher();Question q=owned(id);q.setStatus("active");q.setUpdatedAt(Instant.now());return ApiResponse.ok(repo.save(q));}
 @PostMapping("/public/{id}/copy") public ApiResponse<?> copy(@PathVariable Long id){requireTeacher();Question source=repo.findById(id).orElseThrow(()->new BusinessException("题目不存在"));if(!"public".equals(source.getVisibility())||!"active".equals(source.getStatus()))throw new BusinessException("题目当前不可复制");Question q=new Question();q.setOwnerUserId(StpUtil.getLoginIdAsLong());q.setType(source.getType());q.setTitle(source.getTitle());q.setContent(source.getContent());q.setOptions(source.getOptions());q.setAnswer(source.getAnswer());q.setRubric(source.getRubric());q.setTags(source.getTags());q.setAssessmentPoints(source.getAssessmentPoints());q.setDifficulty(source.getDifficulty());q.setScore(100);return ApiResponse.ok(repo.save(q));}
 private void validate(Request r){
  if("DIALOGUE".equalsIgnoreCase(r.type())&&(r.rubric()==null||r.rubric().isBlank()))throw new BusinessException("对话题必须填写评分标准");
  // 维度是受控词表，可以多选；考察点必须属于所选维度之一，杜绝自由输入。
  if(r.tags().isEmpty())throw new BusinessException("请至少选择一个维度");
  try{AiTaxonomy.validate(r.tags(),r.assessmentPoints());}catch(IllegalArgumentException e){throw new BusinessException(e.getMessage());}
 }
 private void apply(Question q,Request r){q.setType(r.type());q.setTitle(r.title());q.setContent(r.content());q.setOptions(r.options());q.setAnswer(r.answer());q.setRubric(r.rubric());q.setDifficulty(r.difficulty()==null?1:r.difficulty());q.setScore(100);q.setTags(json(r.tags()));q.setAssessmentPoints(json(r.assessmentPoints()));}
 /**
  * 公共题库的对外形状：题目本身可以给所有登录用户看（教师之间互相借用），
  * 但 answer / rubric 是参考答案与评分标准，不能跟着列表一起发出去——
  * 学生也调得到这个接口，拿到就等于提前拿到答案。复制到自己的题库由后端
  * 直接读原题完成，不需要前端拿到答案再回传。
  */
 private Map<String,Object> publicView(Question q){Map<String,Object> d=new LinkedHashMap<>();d.put("id",q.getId());d.put("type",q.getType());d.put("title",q.getTitle());d.put("content",q.getContent());d.put("options",q.getOptions());d.put("tags",q.getTags());d.put("assessmentPoints",q.getAssessmentPoints());d.put("difficulty",q.getDifficulty());d.put("score",100);d.put("visibility",q.getVisibility());d.put("status",q.getStatus());d.put("createdAt",q.getCreatedAt());return d;}
 private String json(Object value){try{return mapper.writeValueAsString(value);}catch(JsonProcessingException e){throw new BusinessException("标签数据格式错误");}}
 private List<String> list(String value){if(value==null||value.isBlank())return List.of();try{return mapper.readValue(value,new com.fasterxml.jackson.core.type.TypeReference<List<String>>(){});}catch(Exception e){throw new BusinessException("原题标签数据格式错误");}}
 private Question owned(Long id){Question q=repo.findById(id).orElseThrow(()->new BusinessException("题目不存在"));if(!Objects.equals(q.getOwnerUserId(),StpUtil.getLoginIdAsLong()))throw new BusinessException("无权操作该题目");return q;}
 /** 题库是教师资产：学生账号不该能建题、改题、公开题，也不该能从公共题库复制。 */
 protected long userId(){return StpUtil.getLoginIdAsLong();}
 private void requireTeacher(){if(!accounts.existsTeacher(StpUtil.getLoginIdAsLong()))throw new BusinessException("只有教师可以维护题库",HttpStatus.FORBIDDEN);}
 public record GenerateRequest(String instruction) {}
}
