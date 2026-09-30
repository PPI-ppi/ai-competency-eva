# -*- coding: utf-8 -*-
"""文档追加：第五轮 对话窗口/最终方案分离"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\测评流程修复记录与部署指引.md"
s = io.open(P, encoding='utf-8').read()

anchor = "### 仍被前端白名单拦截（`src/api/zip-backend-routes.json` 59 条，需改源码放行）"
assert s.count(anchor) == 1, f'anchor count {s.count(anchor)}'
addition = '''
## 十、第五轮（2026-09-30 20:00）：对话窗口与「提交最终方案」行为分离

### 用户期望（产品语义）
- **对话模型窗口**：普通 LLM 对话（简单接一个 API、无任何设定），聊天过程有 Agent 监测（消息入库、可回看）；**不评分、不推进**。
- **提交最终方案框**：唯一正式提交入口。只有在这里提交才算完成这道题 → Agent 评分 → 决定追问或下一题。
- **追问**：显示在左侧「Agent 测评官」区域（followUps）；追问答案也**在提交最终方案框**提交，提交后 Agent 继续评分判断。

### 原实现的问题
对话窗口发送与提交最终方案**共用同一个 `sendContent` → `POST /api/assessments/{id}/chat/stream`**（状态机接口）。对话窗口的普通消息会被后端当成正式作答（评分/追问/推进），行为不符合预期。

### 修复
| 层 | 改动 |
| --- | --- |
| 后端 `AssessmentAgentService` | 新增 `plainChat()`：只做普通 LLM 对话（`llm.chat` + 题干上下文 + 历史），消息以 student/llm 入库（Agent 监测、对话自动保存），**不评分、不触发追问、不推进状态机**。 |
| 后端 `AssessmentController` | 新增 `POST /api/assessments/{id}/chat`（SSE，produces text/event-stream）→ `plainChat`。 |
| 后端 `followUps()` | 修复：原来从 `i=1` 跳过第一条 AI 消息，题干 prompt 未落库时追问会被误跳过 → 改为从 `i=0` 开始、仅跳过内容与题面相同的消息，保证追问必显示。 |
| 前端 `services.js` | 新增 `sendAssessmentPlainChat()`（SSE POST `/api/assessments/{id}/chat`，只处理 delta/done/error）。 |
| 前端 `main.jsx` | ① 对话窗口 `send` → 改走 `sendAssessmentPlainChat`（纯聊）；② `submitFinal`（提交最终方案）→ **保持**走 `sendContent` → `chat/stream` 状态机（评分/追问/下一题）；③ `selectQuestion` 辅助接口（select/workspace）不在白名单时静默（题目数据已在左侧列表），不再弹「此功能暂未接入」。 |
| 前端白名单 `zip-backend-routes.json` | 新增 `POST /api/assessments/{id}/chat`（60 条）。 |

### 生产验证（2026-09-30 20:0x 上线）
| 步骤 | 结果 |
| --- | --- |
| 对话窗口 `/chat` 发普通问题 | `delta`+`done` 返回 LLM 回复（计算 5000×15%=750），题目状态保持 `sent`，**不评分不推进** ✓ |
| 提交最终方案 `/chat/stream` | `event: followup` 返回追问（"具体会查哪些信息或指标判断15%是否可信？"）✓ |
| conversation `followUps` | 1 条追问，内容正确 → 左侧「Agent 测评官」显示 ✓ |
| 追问答案在最终方案框提交 | 继续 `followup` 追问（"分步核实第一步会查什么"），追问闭环正常 ✓ |
| 部署 | 后端 jar（45.8MB，含 plainChat+followUps 修复）+ 前端 `index-BzoCFEd4.js`（811KB）+ 白名单 60 条，服务 active |
'''
s2 = s.replace(anchor, addition + anchor, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('文档已追加第五轮，bytes:', len(s2) - len(s))
print('OK')
