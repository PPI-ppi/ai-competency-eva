# -*- coding: utf-8 -*-
"""测评页左右等高固定 + 报告页分数横条（第 12 轮 UI 调整）"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ROOT = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src"

# ============ 1) main.jsx：分数卡加 class ============
P1 = ROOT + r"\main.jsx"
s1 = io.open(P1, encoding='utf-8').read()
old_jsx = '<section className="snapshot-score-advice"><article><small>本次真实分数</small>'
assert s1.count(old_jsx) == 1, f'jsx {s1.count(old_jsx)}'
s1 = s1.replace(old_jsx, '<section className="snapshot-score-advice"><article className="snapshot-score-bar"><small>本次真实分数</small>', 1)
io.open(P1, 'w', encoding='utf-8', newline='').write(s1)
print('main.jsx OK')

# ============ 2) styles.css：测评页 + 报告页 ============
P2 = ROOT + r"\styles.css"
s2 = io.open(P2, encoding='utf-8').read()

# 2.1 测评页：固定整屏高，左右等高，内部滚动
old_wb = ".agent-workbench{min-height:100vh;padding:18px;display:grid;grid-template-columns:minmax(320px,31%) minmax(0,1fr);gap:14px;color:#28354b;"
assert s2.count(old_wb) == 1, f'wb {s2.count(old_wb)}'
s2 = s2.replace(old_wb, ".agent-workbench{height:100vh;min-height:0;box-sizing:border-box;padding:18px;display:grid;grid-template-columns:minmax(320px,31%) minmax(0,1fr);gap:14px;color:#28354b;", 1)

old_lr = ".agent-workbench-left,.agent-workbench-right{min-height:calc(100vh - 36px);border:1px solid #eadfce;"
assert s2.count(old_lr) == 1, f'lr {s2.count(old_lr)}'
s2 = s2.replace(old_lr, ".agent-workbench-left,.agent-workbench-right{height:calc(100vh - 36px);min-height:0;border:1px solid #eadfce;", 1)

# 2.2 移动端：恢复自适应
old_mq = "@media(max-width:900px){.agent-workbench{grid-template-columns:1fr;padding:10px}.agent-workbench-left,.agent-workbench-right{min-height:auto}.agent-workbench-left{max-height:none}.agent-workbench-right{padding:16px}"
assert s2.count(old_mq) == 1, f'mq {s2.count(old_mq)}'
s2 = s2.replace(old_mq, "@media(max-width:900px){.agent-workbench{grid-template-columns:1fr;padding:10px;height:auto;min-height:100vh}.agent-workbench-left,.agent-workbench-right{min-height:auto;height:auto}.agent-workbench-left{max-height:none}.agent-workbench-right{padding:16px}", 1)

# 2.3 报告页：分数块改横向第一行
old_adv = ".snapshot-score-advice{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;margin-top:18px}.snapshot-score-advice>article{padding:23px;border:1px solid #eee1d0;border-radius:18px;background:#fff}.snapshot-score-advice>article:first-child{background:linear-gradient(135deg,#24231f,#35332d);color:#fff;display:flex;flex-direction:column;justify-content:center}.snapshot-score-advice small{color:#d3c8b8}.snapshot-score-advice strong{margin:7px 0;color:#ffc238}.snapshot-score-advice h3,.snapshot-dimension-analysis h3,.snapshot-radar-change h3,.snapshot-skill-tree h3{margin:0 0 12px}"
assert s2.count(old_adv) == 1, f'adv {s2.count(old_adv)}'
new_adv = ".snapshot-score-advice{display:flex;flex-direction:column;gap:14px;margin-top:18px}.snapshot-score-advice>article{padding:23px;border:1px solid #eee1d0;border-radius:18px;background:#fff}.snapshot-score-advice .snapshot-score-bar{background:linear-gradient(135deg,#24231f,#35332d);color:#fff;display:flex;align-items:center;justify-content:center;gap:22px;padding:15px 23px}.snapshot-score-advice small{color:#d3c8b8}.snapshot-score-advice .snapshot-score-bar strong{margin:0;color:#ffc238;font-size:42px;line-height:1}.snapshot-score-advice .snapshot-score-bar strong i{font-size:16px;font-style:normal;margin-left:2px}.snapshot-score-advice .snapshot-score-bar b{padding:6px 16px;border-radius:999px;background:#ffd254;color:#24231f;font-size:15px;font-weight:800}.snapshot-score-advice h3,.snapshot-dimension-analysis h3,.snapshot-radar-change h3,.snapshot-skill-tree h3{margin:0 0 12px}"
s2 = s2.replace(old_adv, new_adv, 1)
io.open(P2, 'w', encoding='utf-8', newline='').write(s2)
print('styles.css OK')
print('ALL DONE')
