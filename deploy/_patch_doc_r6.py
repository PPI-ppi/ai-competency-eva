# -*- coding: utf-8 -*-
"""追加第六节：报告页技能树/技能掌握说明/维度分析修复记录"""
import io, sys, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\测评流程修复记录与部署指引.md"
s = io.open(P, encoding='utf-8').read()
sec = '''

---

## 第十一节 报告页空白修复（技能树/技能掌握说明/六维分析/雷达图/建议排版）

**现象**（2026-09-30 20:00 用户截图）：任务报告页"测评后技能树"与"技能掌握说明"显示"后端尚未返回…"；六维能力分析 4 个维度显示"后端尚未返回该维度分析"；雷达图只有"测评后"；AI 建议是原始 JSON 文本。

**根因**（已核实源码 + 线上接口）：
1. 前端 `ReportSnapshotDetail` 技能树取自快照 `skillTree||skills||skillPoints`，后端 `result()` 从未返回 → 空数组 → 显示"后端尚未返回"。
2. 前端六维分析 `analysis` 取 `afterItem.analysis||description`，后端维度只有 `{dimension,score,questionCount,tested}`，无分析文本。
3. 前端雷达图"测评前"取 `beforeDimensions||abilityBefore.dimensions`，后端从未返回 → previous 全空 → 只有测评后。
4. AI 建议 `advice` 是 LLM 生成的 JSON 字符串，前端直接 `<p>{advice}</p>` → 显示原始 JSON。

**修复**：
- 后端 `AssessmentAgentService.result()` 报告增强：
  - 解析 `assessment.advice`（LLM 报告 JSON）→ `dimensions.{维度}` 回填每维 `analysis` 文本；
  - 新增 `beforeDimensions`：按 `classId+studentUserId` 查本场开始前最近一次历史维度分（无历史→null，雷达图自然只显示测评后）；
  - 新增 `skillTree`：从考察点得分推导 `{name, assessmentPoint, dimension, score, status, lit}`，status 规则 = score≥75 mastered / >0 learning / 未测 locked；
  - `AssessmentDimensionScoreRepository` 新增 `findHistoryByClassAndStudent`。
- 前端 `main.jsx`：AI 建议解析 JSON 渲染结构化（总评/各维度分析/考察点表现/学习建议），失败回退原文。

**部署**：jar `app.jar`（报告增强 v2，含 status 修正，45.8MB，2026-09-30 20:10）；前端 `dist` 上传 `index-10dKy5D5.js`+`index-BRuEaqxN.css`+`index.html`（2026-09-30 20:01）。备份：`app.jar.bak-report-*`、`app.jar.bak-report2-*`。

**验证**（SSE 真实流程建班→对话→提交最终方案→追问→收尾→result）：
- `dimensions(6)`：每维带 score + analysis（如"得分38.18…需加强基础概念掌握"/"未测准"）✓
- `skillTree`：`AI基本概念理解 15.13 learning`（未测点前端显示"未解锁"）✓
- `beforeDimensions`：首次测评 null（有历史测评后显示"测评前"曲线）✓
- `advice`：完整 JSON，前端结构化渲染 ✓
- 公网首页 HTTP 200、服务 active ✓
'''
s += sec
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('追加第十一节 OK, bytes:', len(s))
