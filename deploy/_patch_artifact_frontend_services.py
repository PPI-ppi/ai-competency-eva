# -*- coding: utf-8 -*-
"""前端 services.js：uploadArtifact + sendAssessmentChat 支持附件 ID"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\api\services.js"
s = io.open(P, encoding='utf-8').read()

# 1) assessmentApi 加 uploadArtifact
old_api = "  requestFollowUp: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/follow-up`),"
assert s.count(old_api) == 1, f'api {s.count(old_api)}'
new_api = "  requestFollowUp: (assessmentId, recordQuestionId) => http.post(`/api/assessments/${assessmentId}/questions/${recordQuestionId}/follow-up`),\n  uploadArtifact: (assessmentId, questionId, file, artifactType = \"image\", codeLanguage) => {\n    const form = new FormData();\n    form.append(\"file\", file);\n    form.append(\"assessmentId\", String(assessmentId));\n    form.append(\"assessmentQuestionId\", String(questionId));\n    form.append(\"artifactType\", artifactType);\n    if (codeLanguage) form.append(\"codeLanguage\", codeLanguage);\n    return http.post(\"/api/agent/files\", form);\n  },"
s = s.replace(old_api, new_api, 1)

# 2) sendAssessmentChat 支持第 5 参 extra（body 合并 artifactIds）
old_chat = "export async function sendAssessmentChat(assessmentId, content, handlers = {}, signal) {"
assert s.count(old_chat) == 1, f'chat {s.count(old_chat)}'
new_chat = "export async function sendAssessmentChat(assessmentId, content, handlers = {}, signal, extra = {}) {"
s = s.replace(old_chat, new_chat, 1)
old_body = "    body: JSON.stringify({ content }), credentials: \"include\", signal, openWhenHidden: true,\n    async onopen(response) {\n      if (!response.ok) throw await responseError(response);\n      if (!(response.headers.get(\"content-type\") || \"\").includes(\"text/event-stream\")) throw new SseError(\"后端没有返回 SSE 数据\", { status: response.status });\n    },\n    onmessage(event) {\n      let data = event.data;\n      try { data = JSON.parse(event.data); } catch { /* text delta */ }\n      if ([\"delta\", \"token\"].includes(event.event)) handlers.onDelta?.(typeof data === \"string\" ? data : data?.text ?? data?.content ?? \"\");\n      else if ([\"question\", \"state\", \"finished\"].includes(event.event)) handlers.onState?.(streamUpdate(event.event,data));"
assert s.count(old_body) == 1, f'body {s.count(old_body)}'
new_body = "    body: JSON.stringify({ content, ...extra }), credentials: \"include\", signal, openWhenHidden: true,\n    async onopen(response) {\n      if (!response.ok) throw await responseError(response);\n      if (!(response.headers.get(\"content-type\") || \"\").includes(\"text/event-stream\")) throw new SseError(\"后端没有返回 SSE 数据\", { status: response.status });\n    },\n    onmessage(event) {\n      let data = event.data;\n      try { data = JSON.parse(event.data); } catch { /* text delta */ }\n      if ([\"delta\", \"token\"].includes(event.event)) handlers.onDelta?.(typeof data === \"string\" ? data : data?.text ?? data?.content ?? \"\");\n      else if ([\"question\", \"state\", \"finished\"].includes(event.event)) handlers.onState?.(streamUpdate(event.event,data));"
s = s.replace(old_body, new_body, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('services.js OK')
