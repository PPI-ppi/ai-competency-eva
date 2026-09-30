# -*- coding: utf-8 -*-
"""前端 main.jsx：对话窗口走纯聊天接口；最终方案保持状态机；点题静默缺接口"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx"
s = io.open(P, encoding='utf-8').read()
orig_len = len(s)

# 1) import 增加 sendAssessmentPlainChat
old_import = "import { agentApi, assessmentApi, authApi, classApi, questionApi, sendAssessmentChat, userApi } from \"./api/services\";"
assert s.count(old_import) == 1, f'import count {s.count(old_import)}'
s = s.replace(old_import,
    "import { agentApi, assessmentApi, authApi, classApi, questionApi, sendAssessmentChat, sendAssessmentPlainChat, userApi } from \"./api/services\";", 1)

# 2) 对话窗口 send：改为纯对话接口（不评分、不推进状态机）
old_send = """  const send=async()=>{const content=input.trim();if(await sendContent(content))setInput("")};"""
assert s.count(old_send) == 1, f'send count {s.count(old_send)}'
new_send = """  // 对话模型窗口：纯 LLM 对话（普通聊天，不评分、不推进状态机），消息入库供 Agent 监测/自动保存。
  // 正式作答/追问答案必须在「提交最终方案」框提交（走 sendContent → chat/stream 状态机）。
  const send=async()=>{
    const content=input.trim();
    if(!content||streaming||submitting)return;
    setStreaming(true);setAssistantText("");setError("");
    try{
      await sendAssessmentPlainChat(assessmentId,content,{
        onDelta:delta=>setAssistantText(current=>current+delta),
        onError:err=>setError(err?.message||"对话发送失败")
      });
      applyConversation(await assessmentApi.conversation(assessmentId));
      setAssistantText("");setInput("");
    }catch(err){setError(err?.message||"对话发送失败，请确认记录后重试")}
    finally{setStreaming(false)}
  };"""
s = s.replace(old_send, new_send, 1)

# 3) selectQuestion：辅助接口（select/workspace）不在白名单时静默，不阻塞做题
old_sel = """const selectQuestion=async(item,index)=>{const id=assessmentQuestionId(item);setActiveQuestion(item);setFinalAnswer(item.finalAnswer||"");setSubmitted(item.finalAnswer||"");setError("");if(String(id)===String(currentId))return;try{let next;try{next=await assessmentApi.selectQuestion(assessmentId,id)}catch(err){if(![404,405].includes(err?.status))throw err;next=await assessmentApi.questionWorkspace(assessmentId,id)}setState(current=>({...current,...next,currentIndex:index}));setActiveQuestion(next?.currentQuestion||next?.question||item)}catch(err){setError(err?.message||"该题暂时不能打开")}};"""
assert s.count(old_sel) == 1, f'select count {s.count(old_sel)}'
new_sel = """const selectQuestion=async(item,index)=>{const id=assessmentQuestionId(item);setActiveQuestion(item);setFinalAnswer(item.finalAnswer||"");setSubmitted(item.finalAnswer||"");setError("");if(String(id)===String(currentId))return;try{let next;try{next=await assessmentApi.selectQuestion(assessmentId,id)}catch(err){if(![404,405].includes(err?.status))throw err;next=await assessmentApi.questionWorkspace(assessmentId,id)}setState(current=>({...current,...next,currentIndex:index}));setActiveQuestion(next?.currentQuestion||next?.question||item)}catch(err){if([404,405].includes(err?.status)){/* 题目内容已在左侧列表中，辅助接口未接入时直接使用列表项 */}else{setError(err?.message||"该题暂时不能打开")}}};"""
s = s.replace(old_sel, new_sel, 1)

io.open(P, 'w', encoding='utf-8', newline='').write(s)
print('main.jsx patched:', len(s) - orig_len, 'bytes net change')
print('OK')
