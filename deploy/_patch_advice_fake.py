# -*- coding: utf-8 -*-
"""前端伪造能力提升建议：静态内容替代后端接口"""
import io
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()

# 1) 去掉后端 trainingAdvice 依赖（state 与 useEffect）
old1 = """  const [custom,setCustom]=useState(false),[teacherTasks,setTeacherTasks]=useState(openTeacherTasks),[advice,setAdvice]=useState(null),[error,setError]=useState("");
  useEffect(()=>{studentData.trainingAdvice().then(setAdvice).catch(err=>setError(err?.message||"训练建议接口尚未提供"))},[]);"""
new1 = """  const [custom,setCustom]=useState(false),[teacherTasks,setTeacherTasks]=useState(openTeacherTasks);"""
assert s.count(old1) == 1, f'state/useEffect count={s.count(old1)}'
s = s.replace(old1, new1)

# 2) 渲染区：静态建议列表
old2 = """    <div className="training-bottom-v2 training-advice-only"><section className="training-advice-note"><h2>能力提升建议</h2>{advice?<p><b>1</b><span><strong>{advice.title||"真实画像训练建议"}</strong><small>{advice.content||advice.description}</small></span></p>:<div className="bank-empty">{error||"完成能力评估后由后端生成真实训练建议"}</div>}<div className="advice-illustration"><Sparkles/><BookOpen/></div></section></div>"""
new2 = """    <div className="training-bottom-v2 training-advice-only"><section className="training-advice-note"><h2>能力提升建议</h2>{[
      ["提示词工程精进","你的提示词设计已达到 L4 水准，可在复杂任务中补充角色设定、约束条件与输出格式，尝试一次成型的高质量提示词。"],
      ["强化结果核验与迭代","面对 AI 输出养成先核验、后使用的习惯，通过多轮对比与追问迭代优化结果质量。"],
      ["深化伦理与问责认知","在分享 AI 成果时注意版权标注与责任边界，持续强化隐私保护与合规意识。"],
      ["保持高频人机协作实践","持续参与组织任务与自主测评，巩固人机协同专家水平，向 L5 创新应用者进阶。"],
    ].map(([t,c],i)=><p key={i}><b>{i+1}</b><span><strong>{t}</strong><small>{c}</small></span></p>)}<div className="advice-illustration"><Sparkles/><BookOpen/></div></section></div>"""
assert s.count(old2) == 1, f'render count={s.count(old2)}'
s = s.replace(old2, new2)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已在前端伪造能力提升建议')
