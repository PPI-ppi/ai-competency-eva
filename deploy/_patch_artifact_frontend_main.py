# -*- coding: utf-8 -*-
"""前端 main.jsx：实操题附件上传区 + 提交最终方案带 artifactIds"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()

# 1) 组件签名加附件 props
old_sig = "function AgentAssessmentWorkbench({title,subtitle,questions,question,activeId,onSelect,messages,input,setInput,onSend,streaming,assistantText,finalAnswer,setFinalAnswer,onSubmitFinal,submitting,submitted,followUps=[],error,loading,finished,onFinish,onExit,preview=false,questionIndex=0,onSubmitOption}){"
assert s.count(old_sig) == 1, f'sig {s.count(old_sig)}'
new_sig = "function AgentAssessmentWorkbench({title,subtitle,questions,question,activeId,onSelect,messages,input,setInput,onSend,streaming,assistantText,finalAnswer,setFinalAnswer,onSubmitFinal,submitting,submitted,followUps=[],error,loading,finished,onFinish,onExit,preview=false,questionIndex=0,onSubmitOption,artifacts=[],onUploadFile,uploading=false}){"
s = s.replace(old_sig, new_sig, 1)

# 2) 实操题附件区（插在对话模型面板与提交最终方案面板之间）
old_mid = "        <section className=\"agent-chat-panel\"><header><span><Bot/>对话模型</span><small>已连接 · 对话过程自动保存</small></header><div className=\"agent-chat-stream\">{visibleMessages.length?visibleMessages.map((message,index)=>{const isUser=conversationMessageIsUser(message);return <article className={isUser?\"user\":\"assistant\"} key={message.id||index}>{!isUser&&<Bot/>}<p>{cleanConversationText(conversationMessageContent(message))}</p>{isUser&&<UserRound/>}</article>}):<div className=\"agent-chat-placeholder\">在这里提交回答，Agent 会根据你的作答继续提问。</div>}{assistantText&&<article className=\"assistant\"><Bot/><p>{cleanConversationText(assistantText)}</p></article>}</div><div className=\"agent-chat-input\"><textarea value={input} onChange={event=>setInput(event.target.value)} placeholder=\"向对话模型提问…\"/><button disabled={streaming||!input.trim()} onClick={onSend}>{streaming?\"回复中…\":\"发送\"}</button></div></section>\n        <section className=\"agent-final-panel\">"
assert s.count(old_mid) == 1, f'mid {s.count(old_mid)}'
new_mid = "        <section className=\"agent-chat-panel\"><header><span><Bot/>对话模型</span><small>已连接 · 对话过程自动保存</small></header><div className=\"agent-chat-stream\">{visibleMessages.length?visibleMessages.map((message,index)=>{const isUser=conversationMessageIsUser(message);return <article className={isUser?\"user\":\"assistant\"} key={message.id||index}>{!isUser&&<Bot/>}<p>{cleanConversationText(conversationMessageContent(message))}</p>{isUser&&<UserRound/>}</article>}):<div className=\"agent-chat-placeholder\">在这里提交回答，Agent 会根据你的作答继续提问。</div>}{assistantText&&<article className=\"assistant\"><Bot/><p>{cleanConversationText(assistantText)}</p></article>}</div><div className=\"agent-chat-input\"><textarea value={input} onChange={event=>setInput(event.target.value)} placeholder=\"向对话模型提问…\"/><button disabled={streaming||!input.trim()} onClick={onSend}>{streaming?\"回复中…\":\"发送\"}</button></div></section>\n        {String(question?.type||\"\").toUpperCase()===\"PRACTICAL\"&&<section className=\"agent-artifact-panel\"><header><FileCheck2/>成果附件</header><label className=\"agent-artifact-upload\"><input type=\"file\" disabled={uploading||submitting||streaming} onChange={event=>{const file=event.target.files?.[0];if(file)onUploadFile?.(file);event.target.value=\"\"}}/><span>{uploading?\"上传中…\":\"点击选择成果文件上传\"}</span></label>{artifacts.length>0&&<div className=\"agent-artifact-list\">{artifacts.map((item,index)=><p key={item.artifactId||index}><FileCheck2/>{item.fileName}</p>)}</div>}</section>}\n        <section className=\"agent-final-panel\">"
s = s.replace(old_mid, new_mid, 1)

# 3) LiveAssessmentSession：artifacts/uploading state
old_state = "  const [state,setState]=useState(null),[input,setInput]=useState(\"\"),[streaming,setStreaming]=useState(false),[assistantText,setAssistantText]=useState(\"\"),[finalAnswer,setFinalAnswer]=useState(\"\"),[submitted,setSubmitted]=useState(\"\"),[submitting,setSubmitting]=useState(false),[activeQuestion,setActiveQuestion]=useState(null),[report,setReport]=useState(null),[error,setError]=useState(\"\");"
assert s.count(old_state) == 1, f'state {s.count(old_state)}'
new_state = "  const [state,setState]=useState(null),[input,setInput]=useState(\"\"),[streaming,setStreaming]=useState(false),[assistantText,setAssistantText]=useState(\"\"),[finalAnswer,setFinalAnswer]=useState(\"\"),[submitted,setSubmitted]=useState(\"\"),[submitting,setSubmitting]=useState(false),[activeQuestion,setActiveQuestion]=useState(null),[report,setReport]=useState(null),[error,setError]=useState(\"\"),[artifacts,setArtifacts]=useState([]),[uploading,setUploading]=useState(false);"
s = s.replace(old_state, new_state, 1)

# 4) 切题清空附件
old_effect = "  useEffect(()=>{load()},[assessmentId]);"
assert s.count(old_effect) == 1, f'effect {s.count(old_effect)}'
new_effect = "  useEffect(()=>load(),[assessmentId]);\n  useEffect(()=>{setArtifacts([])},[activeId]);"
s = s.replace(old_effect, new_effect, 1)

# 5) sendContent 支持 extra
old_send = "  const sendContent=async(content)=>{\n    if(!content||streaming||submitting)return false;\n    setStreaming(true);setAssistantText(\"\");setError(\"\");\n    try {\n      await sendAssessmentChat(assessmentId,content,{\n        onDelta:delta=>setAssistantText(current=>current+delta),\n        onState:update=>{if(update)applyConversation({...state,...update})},\n        onError:err=>setError(err?.message||\"作答发送失败\")\n      });"
assert s.count(old_send) == 1, f'send {s.count(old_send)}'
new_send = "  const sendContent=async(content,extra={})=>{\n    if(!content||streaming||submitting)return false;\n    setStreaming(true);setAssistantText(\"\");setError(\"\");\n    try {\n      await sendAssessmentChat(assessmentId,content,{\n        onDelta:delta=>setAssistantText(current=>current+delta),\n        onState:update=>{if(update)applyConversation({...state,...update})},\n        onError:err=>setError(err?.message||\"作答发送失败\")\n      },undefined,extra);"
s = s.replace(old_send, new_send, 1)

# 6) submitFinal 带 artifactIds
old_sub = "  const submitFinal=async()=>{const answer=finalAnswer.trim();if(await sendContent(answer)){setSubmitted(answer);setFinalAnswer(\"\")}};"
assert s.count(old_sub) == 1, f'sub {s.count(old_sub)}'
new_sub = "  const submitFinal=async()=>{const answer=finalAnswer.trim();if(await sendContent(answer,{artifactIds:artifacts.map(item=>item.artifactId)})){setSubmitted(answer);setFinalAnswer(\"\");setArtifacts([])}};"
s = s.replace(old_sub, new_sub, 1)

# 7) uploadFile
old_up = "  // 客观题点击选项：直接提交该选项（复用状态机），提交后自动进入下一题\n  const submitOption=async option=>{if(await sendContent(option)){setSubmitted(option);setFinalAnswer(\"\")}};"
assert s.count(old_up) == 1, f'up {s.count(old_up)}'
new_up = "  // 客观题点击选项：直接提交该选项（复用状态机），提交后自动进入下一题\n  const submitOption=async option=>{if(await sendContent(option)){setSubmitted(option);setFinalAnswer(\"\")}};\n  // 实操题成果附件上传（image/code 存档，随最终方案提交）\n  const uploadFile=async file=>{\n    if(!file||uploading)return;\n    setUploading(true);setError(\"\");\n    try{\n      const data=await assessmentApi.uploadArtifact(assessmentId,assessmentQuestionId(question),file,\"image\");\n      setArtifacts(previous=>[...previous,{artifactId:data.artifactId,fileName:data.fileName||file.name,fileUrl:data.fileUrl}]);\n    }catch(err){setError(err?.message||\"附件上传失败\")}\n    finally{setUploading(false)}\n  };"
s = s.replace(old_up, new_up, 1)

# 8) 传组件
old_pass = "onSubmitFinal={submitFinal} onSubmitOption={submitOption} submitting={submitting} submitted={submitted}"
assert s.count(old_pass) == 1, f'pass {s.count(old_pass)}'
new_pass = "onSubmitFinal={submitFinal} onSubmitOption={submitOption} submitting={submitting} submitted={submitted} artifacts={artifacts} onUploadFile={uploadFile} uploading={uploading}"
s = s.replace(old_pass, new_pass, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('main.jsx OK: 实操题附件区')
