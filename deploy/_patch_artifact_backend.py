# -*- coding: utf-8 -*-
"""后端：chatStream 解析 artifactIds 传入评分 + AgentFileController 用户身份改 Sa-Token"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment"

# ============ 1) AssessmentAgentService：解析 artifactIds ============
P1 = ROOT + r"\service\AssessmentAgentService.java"
s1 = io.open(P1, encoding='utf-8').read()

# 1.1 chatStream 解析
old_cs = "        engine.initializeExistingAssessment(assessmentId);\n        String content = String.valueOf(body == null ? \"\" : body.getOrDefault(\"content\", \"\")).trim();"
assert s1.count(old_cs) == 1, f'cs {s1.count(old_cs)}'
new_cs = "        engine.initializeExistingAssessment(assessmentId);\n        String content = String.valueOf(body == null ? \"\" : body.getOrDefault(\"content\", \"\")).trim();\n        List<Long> artifactIds = parseArtifactIds(body);"
s1 = s1.replace(old_cs, new_cs, 1)

# 1.2 submit 分支传参
old_s1 = "                if (awaitingFollowup(current)) {\n                    handleFollowupAnswer(current, finalSubmission, out);\n                } else if (\"DIALOGUE\".equalsIgnoreCase(current.getType())\n                        || \"PRACTICAL\".equalsIgnoreCase(current.getType())) {\n                    handleFinalSubmission(current, finalSubmission, out);\n                } else {\n                    handleInitialAnswer(current, finalSubmission, out);\n                }"
assert s1.count(old_s1) == 1, f's1 {s1.count(old_s1)}'
new_s1 = "                if (awaitingFollowup(current)) {\n                    handleFollowupAnswer(current, finalSubmission, out);\n                } else if (\"DIALOGUE\".equalsIgnoreCase(current.getType())\n                        || \"PRACTICAL\".equalsIgnoreCase(current.getType())) {\n                    handleFinalSubmission(current, finalSubmission, artifactIds, out);\n                } else {\n                    handleInitialAnswer(current, finalSubmission, artifactIds, out);\n                }"
s1 = s1.replace(old_s1, new_s1, 1)

# 1.3 无 action 分支的 handleInitialAnswer 传参
old_s2 = "            } else {\n                handleInitialAnswer(current, content, out);\n            }"
assert s1.count(old_s2) == 1, f's2 {s1.count(old_s2)}'
new_s2 = "            } else {\n                handleInitialAnswer(current, content, artifactIds, out);\n            }"
s1 = s1.replace(old_s2, new_s2, 1)

# 1.4 handleFinalSubmission 签名与调用
old_hf = "    private void handleFinalSubmission(AssessmentQuestion current, String finalSubmission, OutputStream out) {"
assert s1.count(old_hf) == 1, f'hf {s1.count(old_hf)}'
s1 = s1.replace(old_hf, "    private void handleFinalSubmission(AssessmentQuestion current, String finalSubmission, List<Long> artifactIds, OutputStream out) {", 1)
old_hf2 = "                score.score(), score.r(), score.clarity(), score.comment(), List.of(), List.of());"
assert s1.count(old_hf2) >= 2, f'hf2 {s1.count(old_hf2)}'
s1 = s1.replace(old_hf2, "                score.score(), score.r(), score.clarity(), score.comment(), List.of(), artifactIds);")

# 1.5 handleInitialAnswer 签名与调用
old_hi = "    private void handleInitialAnswer(AssessmentQuestion current, String content, OutputStream out) {"
assert s1.count(old_hi) == 1, f'hi {s1.count(old_hi)}'
s1 = s1.replace(old_hi, "    private void handleInitialAnswer(AssessmentQuestion current, String content, List<Long> artifactIds, OutputStream out) {", 1)

# 1.6 parseArtifactIds 方法（加在 parseReportAdvice 前）
old_par = "    @SuppressWarnings(\"unchecked\")\n    private Map<String, Object> parseReportAdvice(String advice) {"
assert s1.count(old_par) == 1, f'par {s1.count(old_par)}'
new_par = "    /** 解析提交体里的附件 ID（v9 前端实操题上传成果后随最终方案提交）。 */\n    private List<Long> parseArtifactIds(Map<String, Object> body) {\n        if (body == null || !body.containsKey(\"artifactIds\")) return List.of();\n        Object raw = body.get(\"artifactIds\");\n        if (!(raw instanceof List<?> list)) return List.of();\n        List<Long> ids = new ArrayList<>();\n        for (Object o : list) {\n            if (o instanceof Number n) {\n                ids.add(n.longValue());\n            } else if (o != null) {\n                try {\n                    ids.add(Long.parseLong(String.valueOf(o).trim()));\n                } catch (NumberFormatException ignored) {}\n            }\n        }\n        return ids;\n    }\n\n    @SuppressWarnings(\"unchecked\")\n    private Map<String, Object> parseReportAdvice(String advice) {"
s1 = s1.replace(old_par, new_par, 1)
io.open(P1, 'w', encoding='utf-8', newline='').write(s1)
print('AssessmentAgentService OK')

# ============ 2) AgentFileController：用户身份优先 Sa-Token ============
P2 = ROOT + r"\controller\AgentFileController.java"
s2 = io.open(P2, encoding='utf-8').read()
old_u = "    private Long userId(HttpServletRequest req) {\n        String header = req.getHeader(\"X-User-Id\");\n        if (header == null || header.isBlank())\n            throw new BusinessException(\"缺少 X-User-Id 请求头\", HttpStatus.UNAUTHORIZED);\n        try {\n            return Long.parseLong(header.trim());\n        } catch (NumberFormatException e) {\n            throw new BusinessException(\"X-User-Id 必须是数字\", HttpStatus.BAD_REQUEST);\n        }\n    }"
assert s2.count(old_u) == 1, f'u {s2.count(old_u)}'
new_u = "    private Long userId(HttpServletRequest req) {\n        // 优先走登录态（Sa-Token），与其余接口一致；X-User-Id 兜底兼容旧调用方\n        try {\n            return cn.dev33.satoken.stp.StpUtil.getLoginIdAsLong();\n        } catch (Exception ignored) {}\n        String header = req.getHeader(\"X-User-Id\");\n        if (header == null || header.isBlank())\n            throw new BusinessException(\"缺少用户身份\", HttpStatus.UNAUTHORIZED);\n        try {\n            return Long.parseLong(header.trim());\n        } catch (NumberFormatException e) {\n            throw new BusinessException(\"X-User-Id 必须是数字\", HttpStatus.BAD_REQUEST);\n        }\n    }"
s2 = s2.replace(old_u, new_u, 1)
io.open(P2, 'w', encoding='utf-8', newline='').write(s2)
print('AgentFileController OK')
