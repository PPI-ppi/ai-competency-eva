# -*- coding: utf-8 -*-
"""追加第十三节：客观题点击即自动提交跳下一题"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\测评流程修复记录与部署指引.md"
s = io.open(P, encoding='utf-8').read()
sec = '''

---

## 第十三节 客观题点击选项即自动提交并跳下一题

**需求**（用户 2026-09-30）：测评时客观题点击选项后自动提交答案并跳转下一题；仅客观题如此（对话式仍手动在「提交最终方案」框提交）。

**改动**（前端源码，仅 `main.jsx`，未动后端）：
1. `AgentAssessmentWorkbench` 新增 prop `onSubmitOption`；判定 `autoSubmitOption = options.length>0 && type!==DIALOGUE && type!==PRACTICAL`（单选/判断/多选等有选项题）。
2. 选项按钮：客观题点击 → `onSubmitOption(option)` 直接复用状态机提交（`sendContent` → `/chat/stream`），提交后自动进入下一题；期间按钮禁用（防连点）。对话式/实操仍走原 `setFinalAnswer` 手动提交。
3. `LiveAssessmentSession` 新增 `submitOption`（提交后清空提交框），传入组件。

**构建/部署**：`npm run build` 产出 `index-DepPLYpz.js`（812.7KB）；上传 index.html + 新 JS，公网验证 200 / application/javascript。用户需强制刷新（Ctrl+F5）。
'''
s += sec
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('追加第十三节 OK')
