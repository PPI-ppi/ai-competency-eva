# -*- coding: utf-8 -*-
"""追加第十四节：实操题附件上传功能打通"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\测评流程修复记录与部署指引.md"
s = io.open(P, encoding='utf-8').read()
sec = '''

---

## 第十四节 实操题附件上传功能打通（后端已有接口，前端接入）

**需求**（用户 2026-09-30）：实操题前端没有上传附件功能，后端接口早已存在。

**现状核实**：后端 `AgentFileController`（`POST /api/agent/files`：file+assessmentId+assessmentQuestionId+artifactType+codeLanguage；`PUT /{id}/run-result`）与 `EngineService.scoreResult` 的 `artifactIds` 参数已具备，白名单已放行；但 ① 上传接口取用户身份只认 `X-User-Id` 头（前端不带）→ 401；② `AssessmentAgentService.chatStream` 提交时 artifactIds 写死空列表；③ 前端无上传 UI 与调用。

**修复**：
- 后端：
  - `AgentFileController.userId()`：优先 Sa-Token 登录态取 uid，`X-User-Id` 头兜底兼容旧调用方；
  - `AssessmentAgentService.chatStream`：解析 body.`artifactIds`（`parseArtifactIds`），传入 `handleFinalSubmission`/`handleInitialAnswer` → `engine.scoreResult(..., artifactIds)` 落库 `assessment_answers.artifact_ids`。
- 前端：
  - `services.js`：`assessmentApi.uploadArtifact(assessmentId, questionId, file, artifactType, codeLanguage)`（FormData）；`sendAssessmentChat` 增加第 5 参 `extra`，body 合并 `{content, ...extra}`；
  - `main.jsx`：`AgentAssessmentWorkbench` 实操题（`type===PRACTICAL`）显示「成果附件」面板（点击选择文件上传、上传中状态、已传列表）；`LiveAssessmentSession` 新增 `artifacts`/`uploading` 状态与 `uploadFile`（切题自动清空），`submitFinal` 提交时携带 `artifactIds: artifacts.map(...)`；
  - `styles.css`：附件面板/上传按钮/列表样式。
- **nginx**：`/etc/nginx/sites-enabled/default` 新增 `location ^~ /artifacts/ { alias /data/artifacts/; }`（原缺失导致附件 URL 被 SPA fallback 返回 text/html），`nginx -t` 通过并 reload。

**部署**：jar `app.jar`（45.8MB，2026-09-30 20:44）+ 前端 `index-YC1PJcqp.js`+`index-ASKVUKHY.css`（附件面板）；备份 `app.jar.bak-artifact-*`、`ripple-ai-assessment.bak-artifact-*`。

**验证**（端到端：建班→实操题→上传→提交带 artifactIds→查库→公网下载）：
- 上传 200：`{artifactId:8, fileUrl:/artifacts/221/xxx.py, fileName:clean.py, runStatus:pending}`；文件落盘 `/data/artifacts/221/`；
- 提交最终方案（含 artifactIds）事件流正常（followup 追问流程）；DB `assessment_answers.artifact_ids = ["8"]` ✓；
- 公网 `http://120.26.93.206/artifacts/221/xxx.py` 返回真实文件（200，原 SPA fallback 已修复）✓。
'''
s += sec
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('追加第十四节 OK')
