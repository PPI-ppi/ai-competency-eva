# -*- coding: utf-8 -*-
"""改 main.jsx 轮播图引用为 v2 新图"""
import io
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()
old = [
    ('feature-bank.png', 'feature-bank-v2.png'),
    ('feature-profile.png', 'feature-profile-v2.png'),
    ('feature-interaction.png', 'feature-interaction-v2.png'),
]
for a, b in old:
    assert s.count(a) >= 1, a
    s = s.replace(a, b)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('main.jsx 引用已更新为 v2 图')
