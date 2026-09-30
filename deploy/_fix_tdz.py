# -*- coding: utf-8 -*-
"""修复 TDZ：useEffect([activeId]) 移到 activeId 声明之后"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()

# 删除错误位置的 useEffect
old_effect = "  useEffect(()=>load(),[assessmentId]);\n  useEffect(()=>{setArtifacts([])},[activeId]);"
assert s.count(old_effect) == 1, f'e {s.count(old_effect)}'
s = s.replace(old_effect, "  useEffect(()=>load(),[assessmentId]);", 1)

# 在 LiveAssessmentSession 的 activeId 声明后插入（用其特有的下一行 const messages= 锚定）
old_active = "  const activeId=assessmentQuestionId(question);\n  const currentId=assessmentQuestionId(currentQuestion);\n  const messages=question?.messages||"
assert s.count(old_active) == 1, f'a {s.count(old_active)}'
new_active = "  const activeId=assessmentQuestionId(question);\n  useEffect(()=>{setArtifacts([])},[activeId]);\n  const currentId=assessmentQuestionId(currentQuestion);\n  const messages=question?.messages||"
s = s.replace(old_active, new_active, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('TDZ 修复 OK')
