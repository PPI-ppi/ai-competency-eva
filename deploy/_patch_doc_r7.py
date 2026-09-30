# -*- coding: utf-8 -*-
"""追加第十二节：测评页布局 + 报告页分数横条 UI 调整"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\测评流程修复记录与部署指引.md"
s = io.open(P, encoding='utf-8').read()
sec = '''

---

## 第十二节 测评页/报告页 UI 调整（Agent 测评官固定高度 + 分数横条）

**需求**（用户 2026-09-30）：①测评页「Agent 测评官」板块不要随内容拉长，保持固定高度、内容超出用滚轮；②右侧板块底部与左侧齐平；③报告页分数块改为第一行横排，下方才是报告。

**改动**（前端源码，未动后端）：
1. `styles.css` `.agent-workbench`：`min-height:100vh` → `height:100vh; min-height:0; box-sizing:border-box`；`.agent-workbench-left/right`：`min-height` → `height:calc(100vh - 36px); min-height:0`。效果：整屏固定高度，grid 两列等高（底部齐平），左右各自 `overflow:auto` 内部滚动；移动端（≤900px）恢复单列自适应（`height:auto`）。
2. 报告页 `.snapshot-score-advice`：两列 grid（280px 竖长分数卡 + 建议）→ 纵向 flex；分数卡加 `.snapshot-score-bar` 横向条（深色横条内 标签+大分数+等级徽章 横排），AI 建议整宽放其下方。
3. 字体属性按项目规范移入 `typography.css`（`check-typography.mjs` 强制 styles.css 不得含 font-* 属性）。

**构建**：`npm run build` 产出 `index-CAtYC9gn.js`（812.54KB）+ `index-Dsxl3Xrm.css`（323.4KB）。

**部署**：整目录备份 `ripple-ai-assessment.bak-ui-*` 后上传 dist；公网验证首页/JS/CSS 均 200，MIME 正确（application/javascript / text/css）。

**注意**：用户浏览器需强制刷新（Ctrl+F5）避免缓存旧 bundle。
'''
s += sec
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('追加第十二节 OK')
