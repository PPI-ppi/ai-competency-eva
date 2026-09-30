# -*- coding: utf-8 -*-
"""给 main.jsx 补上 isObjective 声明（客观题模式判据）"""
import io, sys
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()
old = "  const autoSubmitOption=options.length>0&&question?.type!==\"DIALOGUE\"&&question?.type!==\"PRACTICAL\";"
new = old + "\n  // 客观题模式：右栏只保留题目与选项（隐藏对话模型与提交面板）\n  const isObjective=autoSubmitOption;"
assert s.count(old) == 1, f'count={s.count(old)}'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已补 isObjective 声明')
