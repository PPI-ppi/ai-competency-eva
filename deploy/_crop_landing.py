# -*- coding: utf-8 -*-
"""把用户提供的三张新界面图按网页轮播容器比例(600:370=1.6216)居中裁剪，输出 feature-*.png"""
import io, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from PIL import Image

SRC = [
    (r'D:\LWH\Documents\xwechat_files\wxid_5qo82txhdnek22_f394\temp\RWTemp\2026-09\3cdb633cacef6ffe1fb334617d4a85c4.png', 'feature-bank-v2.png'),
    (r'D:\LWH\Documents\xwechat_files\wxid_5qo82txhdnek22_f394\temp\RWTemp\2026-09\05eb4e88c9bbac3831ffbb2dbf9de1a4.png', 'feature-profile-v2.png'),
    (r'D:\LWH\Documents\xwechat_files\wxid_5qo82txhdnek22_f394\temp\RWTemp\2026-09\e9a343622b5dbbf87bb7e912f5ddbd12\530665d586651e8a098cd6259c5ea6c8.png', 'feature-interaction-v2.png'),
]
OUT = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\deploy\landing'
os.makedirs(OUT, exist_ok=True)
RATIO = 600 / 370  # 1.6216

for src, name in SRC:
    im = Image.open(src).convert('RGB')
    w, h = im.size
    cur = w / h
    if cur > RATIO:   # 更宽 -> 以高为准裁宽
        nw = int(round(h * RATIO)); x0 = (w - nw) // 2; box = (x0, 0, x0 + nw, h)
    else:            # 更高 -> 以宽为准裁高
        nh = int(round(w / RATIO)); y0 = (h - nh) // 2; box = (0, y0, w, y0 + nh)
    im = im.crop(box)
    im = im.resize((1200, 740), Image.LANCZOS)
    out = os.path.join(OUT, name)
    im.save(out, 'PNG')
    print(f'{name}: 原 {w}x{h} 裁 {box} -> 1200x740, {os.path.getsize(out)//1024}KB')
