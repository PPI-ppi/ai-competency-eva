# -*- coding: utf-8 -*-
"""品牌名替换：汇琪弈康/HUIQI YIKANG → 智测经纬/ZHICE JINGWEI"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()
pairs = [
    ("<b>汇琪弈康</b>", "<b>智测经纬</b>"),
    ("欢迎选择汇琪弈康", "欢迎选择智测经纬"),
    ("ABOUT HUIQI YIKANG", "ABOUT ZHICE JINGWEI"),
    ("汇琪弈康以科学", "智测经纬以科学"),
]
for old, new in pairs:
    n = s.count(old)
    assert n >= 1, f'{old} 未找到'
    s = s.replace(old, new)
    print(f'{old} -> {new} ({n}处)')
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('品牌名替换 OK')
