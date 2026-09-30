# -*- coding: utf-8 -*-
"""前端 services.js：新增 sendAssessmentPlainChat（纯对话 SSE，走 /api/assessments/{id}/chat）"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\api\services.js"
s = io.open(P, encoding='utf-8').read()

anchor = "export const agentApi = {"
assert s.count(anchor) == 1, f'anchor count {s.count(anchor)}'
fn = '''export async function sendAssessmentPlainChat(assessmentId, content, handlers = {}, signal) {
  let completed = false;
  await fetchEventSource(buildApiUrl(`/api/assessments/${assessmentId}/chat`), {
    method: "POST",
    headers: getAuthHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({ content }), credentials: "include", signal, openWhenHidden: true,
    async onopen(response) {
      if (!response.ok) throw await responseError(response);
      if (!(response.headers.get("content-type") || "").includes("text/event-stream")) throw new SseError("后端没有返回 SSE 数据", { status: response.status });
    },
    onmessage(event) {
      let data = event.data;
      try { data = JSON.parse(event.data); } catch { /* text delta */ }
      if (["delta", "token"].includes(event.event)) handlers.onDelta?.(typeof data === "string" ? data : data?.text ?? data?.content ?? "");
      else if (["done", "complete"].includes(event.event)) { completed = true; handlers.onDone?.(data); }
      else if (event.event === "error") throw new SseError(typeof data === "string" ? data : data?.message || "对话模型返回错误");
    },
    onclose() { if (!completed) { handlers.onClose?.(); throw new SseError("对话连接提前中断，请刷新确认记录后再重试"); } },
    onerror(error) { handlers.onError?.(error); throw error; },
  });
}

'''
s2 = s.replace(anchor, fn + anchor, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('sendAssessmentPlainChat added:', len(s2) - len(s), 'bytes')
print('OK')
