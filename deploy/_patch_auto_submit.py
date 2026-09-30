# -*- coding: utf-8 -*-
"""客观题点击选项即自动提交并跳下一题（对话/实操仍手动）"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()

# 1) 组件签名加 onSubmitOption
old_sig = "function AgentAssessmentWorkbench({title,subtitle,questions,question,activeId,onSelect,messages,input,setInput,onSend,streaming,assistantText,finalAnswer,setFinalAnswer,onSubmitFinal,submitting,submitted,followUps=[],error,loading,finished,onFinish,onExit,preview=false,questionIndex=0}){"
assert s.count(old_sig) == 1, f'sig {s.count(old_sig)}'
new_sig = "function AgentAssessmentWorkbench({title,subtitle,questions,question,activeId,onSelect,messages,input,setInput,onSend,streaming,assistantText,finalAnswer,setFinalAnswer,onSubmitFinal,submitting,submitted,followUps=[],error,loading,finished,onFinish,onExit,preview=false,questionIndex=0,onSubmitOption}){"
s = s.replace(old_sig, new_sig, 1)

# 2) 客观题判定变量（插在 options 定义后）
old_opts = "  const options=Array.isArray(question?.options)?question.options:safeList(question?.options);"
assert s.count(old_opts) == 1, f'opts {s.count(old_opts)}'
new_opts = "  const options=Array.isArray(question?.options)?question.options:safeList(question?.options);\n  // 客观题（有选项且非对话/实操）：点击选项即自动提交答案并进入下一题\n  const autoSubmitOption=options.length>0&&question?.type!==\"DIALOGUE\"&&question?.type!==\"PRACTICAL\";"
s = s.replace(old_opts, new_opts, 1)

# 3) 选项点击行为
old_click = "{options.length>0&&<div className=\"agent-option-list\">{options.map((option,index)=><button className={finalAnswer===option?\"selected\":\"\"} onClick={()=>setFinalAnswer(option)} key={option}><i>{String.fromCharCode(65+index)}</i>{option}</button>)}</div>}"
assert s.count(old_click) == 1, f'click {s.count(old_click)}'
new_click = "{options.length>0&&<div className=\"agent-option-list\">{options.map((option,index)=><button className={finalAnswer===option?\"selected\":\"\"} disabled={streaming||submitting} onClick={()=>{if(autoSubmitOption){onSubmitOption?onSubmitOption(option):setFinalAnswer(option)}else{setFinalAnswer(option)}}} key={option}><i>{String.fromCharCode(65+index)}</i>{option}</button>)}</div>}"
s = s.replace(old_click, new_click, 1)

# 4) LiveAssessmentSession 加 submitOption 并传给组件
old_sub = "  const submitFinal=async()=>{const answer=finalAnswer.trim();if(await sendContent(answer)){setSubmitted(answer);setFinalAnswer(\"\")}};"
assert s.count(old_sub) == 1, f'sub {s.count(old_sub)}'
new_sub = "  const submitFinal=async()=>{const answer=finalAnswer.trim();if(await sendContent(answer)){setSubmitted(answer);setFinalAnswer(\"\")}};\n  // 客观题点击选项：直接提交该选项（复用状态机），提交后自动进入下一题\n  const submitOption=async option=>{if(await sendContent(option)){setSubmitted(option);setFinalAnswer(\"\")}};"
s = s.replace(old_sub, new_sub, 1)

old_pass = "onSubmitFinal={submitFinal} submitting={submitting} submitted={submitted}"
assert s.count(old_pass) == 1, f'pass {s.count(old_pass)}'
new_pass = "onSubmitFinal={submitFinal} onSubmitOption={submitOption} submitting={submitting} submitted={submitted}"
s = s.replace(old_pass, new_pass, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('main.jsx OK: 客观题自动提交')
