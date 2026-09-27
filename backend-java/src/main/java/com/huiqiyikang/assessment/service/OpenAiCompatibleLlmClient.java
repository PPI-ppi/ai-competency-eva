package com.huiqiyikang.assessment.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.huiqiyikang.assessment.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class OpenAiCompatibleLlmClient implements LlmClient {
    private final ObjectMapper mapper;
    private final String apiUrl;
    private final String apiKey;
    private final String model;
    private final HttpClient http;
    private final Duration timeout;

    public OpenAiCompatibleLlmClient(
            ObjectMapper mapper,
            @Value("${app.llm.api-url:}") String apiUrl,
            @Value("${app.llm.api-key:}") String apiKey,
            @Value("${app.llm.model:}") String model,
            @Value("${app.llm.timeout-ms:120000}") long timeoutMs) {
        this.mapper = mapper;
        this.apiUrl = normalizeChatCompletionsUrl(apiUrl);
        this.apiKey = apiKey;
        this.model = model;
        this.timeout = Duration.ofMillis(timeoutMs);
        this.http = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofMillis(Math.min(timeoutMs, 10000)))
                .build();
    }

    @Override
    public ScoreResult score(QuestionContext question, String answerContent,
                             List<FollowupTurn> followupHistory) {
        String content = complete("""
                你是 AI 能力测评阅卷官。请严格按题目评分标准评分，只输出 JSON。
                JSON 格式：
                {"score":0,"r":0.0,"clarity":"high","comment":"一句话总评，少于200字"}
                规则：
                1. 客观题 score 只能是 0 或 100，clarity 恒为 high。
                2. 实操题和对话题 score 为 0 到 100 的整数。
                3. r = score / 100。
                4. clarity 只能是 high 或 low。回答过短、跑题、空洞、信息不足时为 low。
                5. 不要输出 JSON 之外的任何文字。
                """, """
                题目：
                %s

                题型：%s
                参考选项：%s
                标准答案：%s
                评分标准：
                %s

                用户原始作答：
                %s

                追问历史：
                %s
                """.formatted(
                question.content(), question.type(), nullToEmpty(question.options()),
                nullToEmpty(question.answer()), nullToEmpty(question.rubric()),
                nullToEmpty(answerContent), write(followupHistory)));
        try {
            JsonNode json = parseJson(content);
            int score = clamp(json.path("score").asInt(0), 0, 100);
            double r = json.hasNonNull("r") ? json.path("r").asDouble(score / 100.0) : score / 100.0;
            String clarity = json.path("clarity").asText("high");
            if (!"low".equalsIgnoreCase(clarity)) clarity = "high";
            String comment = json.path("comment").asText("");
            return new ScoreResult(score, r, clarity.toLowerCase(), comment);
        } catch (Exception e) {
            throw new BusinessException("大模型评分结果格式错误：" + e.getMessage());
        }
    }

    @Override
    public FollowupDecision followup(QuestionContext question, String originalAnswer,
                                     List<FollowupTurn> followupHistory, int followupCount) {
        String content = complete("""
                你是 AI 能力测评的面试官，正在澄清用户刚才的作答。
                目标：判断用户是真的不会，还是会但没有表达清楚。
                规则：
                1. 围绕作答中暴露的具体薄弱点问。
                2. 一次只问一个问题。
                3. 不直接给答案，不提示正确方向，不评价对错。
                4. 不聊无关话题。
                5. 用户说不知道、不会时停止追问。
                6. 最多 3 轮追问。
                输出：
                - 如果继续追问，直接输出问题纯文本。
                - 如果停止，输出 JSON：
                  {"turns":[{"ask":"问题","answer":"回答"}],"end_reason":"3轮用完/用户明确不会/已判断清楚"}
                """, """
                题目：
                %s

                评分标准：
                %s

                用户原始作答：
                %s

                已追问轮数：%d
                已有追问历史：
                %s
                """.formatted(question.content(), nullToEmpty(question.rubric()),
                nullToEmpty(originalAnswer), followupCount, write(followupHistory)));
        String trimmed = content == null ? "" : content.trim();
        if (trimmed.startsWith("{")) {
            try {
                JsonNode json = parseJson(trimmed);
                List<FollowupTurn> turns = mapper.convertValue(
                        json.path("turns"), new TypeReference<List<FollowupTurn>>() {});
                return new FollowupDecision(true, null, turns == null ? followupHistory : turns,
                        json.path("end_reason").asText("已判断清楚"));
            } catch (Exception e) {
                throw new BusinessException("大模型追问结果格式错误：" + e.getMessage());
            }
        }
        return new FollowupDecision(false, trimmed, followupHistory, null);
    }

    @Override
    public String report(String reportDataJson) {
        return complete("""
                你是 AI 能力测评的报告撰写官。请根据后端提供的数据生成个性化测评报告。
                只输出 JSON：
                {"overall":"...","dimensions":{},"points":[],"suggestions":[]}
                未收敛的考察点评为“未测准”，不要硬下结论。
                """, reportDataJson);
    }

    private String complete(String system, String user) {
        if (apiUrl == null || apiUrl.isBlank()) {
            throw new BusinessException("大模型 API 地址未配置");
        }
        if (apiKey == null || apiKey.isBlank()) {
            throw new BusinessException("大模型 API Key 未配置");
        }
        if (model == null || model.isBlank()) {
            throw new BusinessException("大模型名称未配置");
        }
        try {
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("model", model);
            List<Map<String, String>> messages = new ArrayList<>();
            messages.add(Map.of("role", "system", "content", system));
            messages.add(Map.of("role", "user", "content", user));
            body.put("messages", messages);
            body.put("temperature", 0.2);

            HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(apiUrl))
                    .timeout(timeout)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(
                            mapper.writeValueAsString(body), StandardCharsets.UTF_8));
            if (!apiKey.isBlank()) {
                builder.header("Authorization", apiKey.startsWith("Bearer ")
                        ? apiKey : "Bearer " + apiKey);
            }
            HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new BusinessException("大模型调用失败：HTTP "
                        + response.statusCode() + " " + response.body());
            }
            JsonNode root = mapper.readTree(response.body());
            JsonNode choices = root.path("choices");
            if (choices.isArray() && !choices.isEmpty()) {
                String text = choices.get(0).path("message").path("content").asText(null);
                if (text != null) return text;
                text = choices.get(0).path("text").asText(null);
                if (text != null) return text;
            }
            String direct = root.path("content").asText(null);
            if (direct != null) return direct;
            throw new BusinessException("大模型返回中没有可读取的文本");
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException("大模型调用失败：" + e.getMessage());
        }
    }

    private JsonNode parseJson(String text) throws Exception {
        String json = text == null ? "" : text.trim();
        if (json.startsWith("```")) {
            json = json.replaceFirst("^```(?:json)?", "")
                    .replaceFirst("```$", "")
                    .trim();
        }
        int start = json.indexOf('{');
        int end = json.lastIndexOf('}');
        if (start >= 0 && end >= start) json = json.substring(start, end + 1);
        return mapper.readTree(json);
    }

    private String write(Object value) {
        try {
            return mapper.writeValueAsString(value == null ? List.of() : value);
        } catch (Exception e) {
            return "[]";
        }
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private String normalizeChatCompletionsUrl(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String url = raw.replaceAll("/+$", "");
        if (url.endsWith("/chat/completions")) return url;
        if (url.endsWith("/v1")) return url + "/chat/completions";
        if (url.endsWith("/gateway")) return url + "/v1/chat/completions";
        return url;
    }
}
