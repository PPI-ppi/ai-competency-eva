# -*- coding: utf-8 -*-
"""修正：styles.css 移除残留 font-style"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P2 = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\styles.css"
s2 = io.open(P2, encoding='utf-8').read()
old = ".snapshot-score-advice .snapshot-score-bar strong i{font-style:normal;margin-left:2px}"
assert s2.count(old) == 1, s2.count(old)
s2 = s2.replace(old, ".snapshot-score-advice .snapshot-score-bar strong i{margin-left:2px}", 1)
io.open(P2, 'w', encoding='utf-8', newline='').write(s2)
print('OK')
