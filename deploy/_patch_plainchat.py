# -*- coding: utf-8 -*-
"""后端：AssessmentAgentService 增加 plainChat 纯对话方法"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\service\AssessmentAgentService.java"
s = io.open(P, encoding='utf-8').read()

anchor = "    private void handleInitialAnswer(AssessmentQuestion current, String content, OutputStream out) {"
assert s.count(anchor) == 1, f'anchor count {s.count(anchor)}'
method = '''    /**
     * 纯对话（对话模型窗口专用）：只做普通 LLM 对话并把消息入库（供 Agent 监测/自动保存），
     * 不评分、不触发追问、不推进状态机。正式作答必须走 chatStream（提交最终方案）。
     */
    public void plainChat(Long assessmentId, Long userId, String content, OutputStream out) {
        Assessment assessment = owned(assessmentId, userId);
        if (!"in_progress".equals(assessment.getStatus())) {
            sse(out, "error", Map.of("message", "测评已结束"));
            return;
        }
        engine.initializeExistingAssessment(assessmentId);
        String text = String.valueOf(content == null ? "" : content).trim();
        AssessmentQuestion current = currentQuestion(assessmentId);
        if (current == null) {
            sse(out, "error", Map.of("message", "当前没有进行中的题目，请先在「提交最终方案」中作答"));
            return;
        }
        if (text.isBlank()) {
            sse(out, "error", Map.of("message", "对话内容不能为空"));
            return;
        }
        try {
            List<LlmClient.ChatTurn> history = ordinaryConversation(current.getId());
            saveMessage(current.getAssessmentId(), current.getId(), "student", text);
            String reply = llm.chat(questionContext(current), history, text);
            saveMessage(current.getAssessmentId(), current.getId(), "llm", reply);
            sse(out, "delta", Map.of("text", reply));
            sse(out, "done", Map.of("reply", reply));
        } catch (BusinessException e) {
            sse(out, "error", Map.of("message", e.getMessage()));
        } catch (Exception e) {
            sse(out, "error", Map.of("message", "对话模型执行失败：" + e.getMessage()));
        }
    }

'''
s2 = s.replace(anchor, method + anchor, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('AssessmentAgentService plainChat inserted:', len(s2) - len(s), 'bytes added')
print('OK')
