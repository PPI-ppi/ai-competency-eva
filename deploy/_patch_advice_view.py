# -*- coding: utf-8 -*-
"""前端 main.jsx：AI 建议渲染结构化（解析 advice JSON）"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()
orig = len(s)

# 1) advice 解析变量（插在 skills 定义后）
old = "  const skills=skillItemsFrom(snapshot?.skillTree||snapshot?.skills||snapshot?.skillPoints);"
assert s.count(old) == 1, f'c1 {s.count(old)}'
new = '''  const skills=skillItemsFrom(snapshot?.skillTree||snapshot?.skills||snapshot?.skillPoints);
  const adviceParsed=(()=>{if(!advice||typeof advice!=="string")return null;try{const value=JSON.parse(advice);return value&&typeof value==="object"&&(value.overall||value.dimensions||value.suggestions)?value:null}catch{return null}})();'''
s = s.replace(old, new, 1)

# 2) AI 建议渲染
old2 = "<article><h3><Sparkles/>AI 建议</h3>{advice?<p>{advice}</p>:<p className=\"snapshot-missing\">后端尚未返回基于本次作答生成的200–300字建议。</p>}</article>"
assert s.count(old2) == 1, f'c2 {s.count(old2)}'
new2 = '''<article><h3><Sparkles/>AI 建议</h3>{adviceParsed?<div className="snapshot-advice-structured">{adviceParsed.overall&&<p className="snapshot-advice-overall">{adviceParsed.overall}</p>}{adviceParsed.dimensions&&<div className="snapshot-advice-dims">{Object.entries(adviceParsed.dimensions).map(([dimension,text])=><p key={dimension}><b>{dimension}</b><span>{text}</span></p>)}</div>}{(adviceParsed.points||[]).length>0&&<div className="snapshot-advice-list"><h4>考察点表现</h4>{(adviceParsed.points||[]).map((point,index)=><p key={index}>· {point}</p>)}</div>}{(adviceParsed.suggestions||[]).length>0&&<div className="snapshot-advice-list"><h4>学习建议</h4>{(adviceParsed.suggestions||[]).map((item,index)=><p key={index}>· {item}</p>)}</div>}</div>:advice?<p>{advice}</p>:<p className="snapshot-missing">后端尚未返回基于本次作答生成的200–300字建议。</p>}</article>'''
s = s.replace(old2, new2, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('advice 结构化渲染完成, net:', len(s) - orig)
print('OK')
