# -*- coding: utf-8 -*-
"""styles.css：实操题成果附件区样式（无 font-* 属性，符合校验）"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\styles.css"
s = io.open(P, encoding='utf-8').read()
anchor = ".agent-chat-input button:disabled,.agent-final-panel button:disabled{opacity:.5}"
assert s.count(anchor) == 1, s.count(anchor)
new_block = anchor + ".agent-artifact-panel{margin-top:12px;padding:14px;border:1px solid #eee4d7;border-radius:15px;background:#fff}.agent-artifact-panel>header{display:flex;align-items:center;gap:8px;color:#a66d14}.agent-artifact-panel>header svg{width:18px}.agent-artifact-upload{display:block;margin-top:10px;padding:13px;border:1px dashed #e2c89a;border-radius:10px;background:#fffaf0;color:#a06a18;text-align:center;cursor:pointer}.agent-artifact-upload input{display:none}.agent-artifact-list{margin-top:9px;display:grid;gap:6px}.agent-artifact-list p{margin:0;padding:8px 11px;border-radius:9px;background:#f4f8fc;color:#41617f;display:flex;align-items:center;gap:7px}.agent-artifact-list p svg{width:15px;color:#eaa21c;flex:0 0 auto}"
s = s.replace(anchor, new_block, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('styles.css OK')
