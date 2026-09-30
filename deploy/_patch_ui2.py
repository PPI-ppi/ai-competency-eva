# -*- coding: utf-8 -*-
"""修正：把字体属性从 styles.css 移到 typography.css（构建校验要求）"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src"

P2 = ROOT + r"\styles.css"
s2 = io.open(P2, encoding='utf-8').read()
old = ".snapshot-score-advice .snapshot-score-bar strong{margin:0;color:#ffc238;font-size:42px;line-height:1}.snapshot-score-advice .snapshot-score-bar strong i{font-size:16px;font-style:normal;margin-left:2px}.snapshot-score-advice .snapshot-score-bar b{padding:6px 16px;border-radius:999px;background:#ffd254;color:#24231f;font-size:15px;font-weight:800}"
assert s2.count(old) == 1, f'c2 {s2.count(old)}'
new = ".snapshot-score-advice .snapshot-score-bar strong{margin:0;color:#ffc238}.snapshot-score-advice .snapshot-score-bar strong i{font-style:normal;margin-left:2px}.snapshot-score-advice .snapshot-score-bar b{padding:6px 16px;border-radius:999px;background:#ffd254;color:#24231f}"
s2 = s2.replace(old, new, 1)
io.open(P2, 'w', encoding='utf-8', newline='').write(s2)
print('styles.css 清理 OK')

P3 = ROOT + r"\typography.css"
s3 = io.open(P3, encoding='utf-8').read()
old3 = ".snapshot-score-advice strong{font-size:52px}.snapshot-score-advice strong i{font-size:15px;font-style:normal}"
assert s3.count(old3) == 1, f'c3 {s3.count(old3)}'
new3 = ".snapshot-score-advice strong{font-size:52px}.snapshot-score-advice strong i{font-size:15px;font-style:normal}.snapshot-score-advice .snapshot-score-bar strong{font-size:42px;line-height:1}.snapshot-score-advice .snapshot-score-bar strong i{font-size:16px;font-style:normal}.snapshot-score-advice .snapshot-score-bar b{font-size:15px;font-weight:800}"
s3 = s3.replace(old3, new3, 1)
io.open(P3, 'w', encoding='utf-8', newline='').write(s3)
print('typography.css OK')
