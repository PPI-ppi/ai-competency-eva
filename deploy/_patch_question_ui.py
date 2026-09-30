# -*- coding: utf-8 -*-
"""测评页右栏按题型裁剪：客观题只留题目+选项；实操题去掉对话模型"""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()

# 1) 根元素加 objective-mode 类
old1 = '  return <main className={`agent-workbench ${preview?"preview":""}`}>'
assert s.count(old1) == 1, f'1 {s.count(old1)}'
s = s.replace(old1, '  return <main className={`agent-workbench ${preview?"preview":""} ${isObjective?" objective-mode":""}`}>', 1)

# 2) 对话模型：客观题隐藏（整行 538 唯一）
old2 = '        <section className="agent-chat-panel"><header><span><Bot/>对话模型</span><small>已连接 · 对话过程自动保存</small></header><div className="agent-chat-stream">{visibleMessages.length?visibleMessages.map((message,index)=>{const isUser=conversationMessageIsUser(message);return <article className={isUser?"user":"assistant"} key={message.id||index}>{!isUser&&<Bot/>}<p>{cleanConversationText(conversationMessageContent(message))}</p>{isUser&&<UserRound/>}</article>}):<div className="agent-chat-placeholder">在这里提交回答，Agent 会根据你的作答继续提问。</div>}{assistantText&&<article className="assistant"><Bot/><p>{cleanConversationText(assistantText)}</p></article>}</div><div className="agent-chat-input"><textarea value={input} onChange={event=>setInput(event.target.value)} placeholder="向对话模型提问…"/><button disabled={streaming||!input.trim()} onClick={onSend}>{streaming?"回复中…":"发送"}</button></div></section>'
assert s.count(old2) == 1, f'2 {s.count(old2)}'
new2 = '        {!isObjective&&<section className="agent-chat-panel"><header><span><Bot/>对话模型</span><small>已连接 · 对话过程自动保存</small></header><div className="agent-chat-stream">{visibleMessages.length?visibleMessages.map((message,index)=>{const isUser=conversationMessageIsUser(message);return <article className={isUser?"user":"assistant"} key={message.id||index}>{!isUser&&<Bot/>}<p>{cleanConversationText(conversationMessageContent(message))}</p>{isUser&&<UserRound/>}</article>}):<div className="agent-chat-placeholder">在这里提交回答，Agent 会根据你的作答继续提问。</div>}{assistantText&&<article className="assistant"><Bot/><p>{cleanConversationText(assistantText)}</p></article>}</div><div className="agent-chat-input"><textarea value={input} onChange={event=>setInput(event.target.value)} placeholder="向对话模型提问…"/><button disabled={streaming||!input.trim()} onClick={onSend}>{streaming?"回复中…":"发送"}</button></div></section>}'
s = s.replace(old2, new2, 1)

# 3) 提交最终方案：客观题隐藏
old3 = '        <section className="agent-final-panel"><header><FileCheck2/><b>提交最终方案</b></header><textarea value={finalAnswer} onChange={event=>setFinalAnswer(event.target.value)} placeholder="将你与模型对话后整理出的最终答案或技术方案填写在这里…"/><footer><span>提交后，Agent 将根据方案追问或进入下一题。</span><button disabled={submitting||streaming||!finalAnswer.trim()} onClick={onSubmitFinal}>{submitting?"提交中…":"提交方案"}</button></footer></section>'
assert s.count(old3) == 1, f'3 {s.count(old3)}'
new3 = '        {!isObjective&&<section className="agent-final-panel"><header><FileCheck2/><b>提交最终方案</b></header><textarea value={finalAnswer} onChange={event=>setFinalAnswer(event.target.value)} placeholder="将你与模型对话后整理出的最终答案或技术方案填写在这里…"/><footer><span>提交后，Agent 将根据方案追问或进入下一题。</span><button disabled={submitting||streaming||!finalAnswer.trim()} onClick={onSubmitFinal}>{submitting?"提交中…":"提交方案"}</button></footer></section>}'
s = s.replace(old3, new3, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('右栏按题型裁剪 OK')
