# -*- coding: utf-8 -*-
"""styles.css：客观题模式题目/选项居中限宽"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\styles.css"
s = io.open(P, encoding='utf-8').read()
anchor = ".agent-option-list button.selected{"
assert s.count(anchor) == 1, s.count(anchor)
# 在客观题模式样式前插入锚点（替换整段末尾）
old = ".agent-option-list button.selected i{background:#ffb126;color:#fff}"
assert s.count(old) == 1, s.count(old)
new = old + ".agent-workbench.objective-mode .agent-question-detail{max-width:780px;margin:0 auto;padding-top:34px}.agent-workbench.objective-mode .agent-option-list{max-width:620px;margin:26px auto 0;grid-auto-rows:auto}.agent-workbench.objective-mode .agent-option-list button{min-height:50px}"
s = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('objective-mode CSS OK')
