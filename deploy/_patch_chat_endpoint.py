# -*- coding: utf-8 -*-
"""后端：AssessmentController 增加 POST /api/assessments/{id}/chat 纯对话端点"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\controller\AssessmentController.java"
s = io.open(P, encoding='utf-8').read()

anchor = '''    /** 确认结束测评：Agent 收尾、算总分、落结果。 */'''
assert s.count(anchor) == 1, f'anchor count {s.count(anchor)}'
endpoint = '''    /**
     * 纯对话（对话模型窗口）：普通 LLM 对话，只记录不评分、不推进状态机。
     * 正式作答/追问答案必须走 /chat/stream（提交最终方案）。
     */
    @PostMapping(value = "/assessments/{id}/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public void plainChat(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body,
            HttpServletResponse response) throws IOException {
        owned(id);
        response.setContentType("text/event-stream;charset=UTF-8");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        OutputStream out = response.getOutputStream();
        String content = body == null ? null : String.valueOf(body.getOrDefault("content", ""));
        try {
            agent.plainChat(id, uid(), content, out);
        } catch (BusinessException e) {
            if (!response.isCommitted()) {
                out.write(("event: error\\ndata: " + mapper.writeValueAsString(e.getMessage()) + "\\n\\n")
                        .getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        }
    }

'''
s2 = s.replace(anchor, endpoint + anchor, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('AssessmentController /chat endpoint inserted:', len(s2) - len(s), 'bytes added')
print('OK')
