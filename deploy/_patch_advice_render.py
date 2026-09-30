# -*- coding: utf-8 -*-
"""修复 ReportSnapshotDetail 渲染：AI建议 points/dimensions/suggestions 对象字段兜底（防 React #31）"""
import io, sys
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()

pairs = [
    # 1) points：对象数组 → 提取可读文本
    (
        "{(adviceParsed.points||[]).map((point,index)=><p key={index}>· {point}</p>)}",
        "{(adviceParsed.points||[]).map((point,index)=><p key={index}>· {typeof point===\"string\"?point:(point?.name||point?.assessmentPoint||point?.comment||point?.text||JSON.stringify(point))}</p>)}",
    ),
    # 2) suggestions：对象兜底
    (
        "{(adviceParsed.suggestions||[]).map((item,index)=><p key={index}>· {item}</p>)}",
        "{(adviceParsed.suggestions||[]).map((item,index)=><p key={index}>· {typeof item===\"string\"?item:(item?.text||item?.content||JSON.stringify(item))}</p>)}",
    ),
    # 3) dimensions：value 对象兜底
    (
        "{adviceParsed.dimensions&&<div className=\"snapshot-advice-dims\">{Object.entries(adviceParsed.dimensions).map(([dimension,text])=><p key={dimension}><b>{dimension}</b><span>{text}</span></p>)}</div>}",
        "{adviceParsed.dimensions&&<div className=\"snapshot-advice-dims\">{Object.entries(adviceParsed.dimensions).map(([dimension,text])=><p key={dimension}><b>{dimension}</b><span>{typeof text===\"string\"?text:(text?.text||text?.content||JSON.stringify(text))}</span></p>)}</div>}",
    ),
]
for old, new in pairs:
    n = s.count(old)
    print(f'命中 {n} 次: {old[:50]}...')
    assert n >= 1, f'未命中: {old[:60]}'
    s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已修复')
