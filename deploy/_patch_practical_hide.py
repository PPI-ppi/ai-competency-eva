# -*- coding: utf-8 -*-
"""前端：实操题(PRACTICAL)隐藏对话模型 panel（保留题目/附件/提交区）"""
import io, sys
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()

# 1) 定义 isPractical（与附件面板同判据）
old1 = "  // 客观题模式：右栏只保留题目与选项（隐藏对话模型与提交面板）\n  const isObjective=autoSubmitOption;"
new1 = old1 + "\n  // 实操题：右栏只保留题目、成果附件与提交区（隐藏对话模型）\n  const isPractical=String(question?.type||\"\").toUpperCase()===\"PRACTICAL\";"
assert s.count(old1) == 1, f'isObjective 定义 count={s.count(old1)}'
s = s.replace(old1, new1)

# 2) 对话模型 panel 条件加 !isPractical
old2 = "{!isObjective&&<section className=\"agent-chat-panel\">"
new2 = "{!isObjective&&!isPractical&&<section className=\"agent-chat-panel\">"
assert s.count(old2) == 1, f'chat-panel count={s.count(old2)}'
s = s.replace(old2, new2)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已改：实操题隐藏对话模型 panel')
