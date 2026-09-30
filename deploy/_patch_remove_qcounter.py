# -*- coding: utf-8 -*-
"""删除测评页右上角『第 X 题 / 共 X 题』"""
import io
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()
old = '<header><span>{assessmentQuestionType(question)}</span><b>第 {Math.min(total,Number(questionIndex)+1)} 题 / 共 {total} 题</b></header>'
new = '<header><span>{assessmentQuestionType(question)}</span></header>'
assert s.count(old) == 1, f'count={s.count(old)}'
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已删除右上角题目数量')
