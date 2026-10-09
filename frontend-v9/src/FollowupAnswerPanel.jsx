import React, {useState} from "react";

export default function FollowupAnswerPanel({disabled, onSubmit}) {
  const [answer,setAnswer]=useState("");
  const [sending,setSending]=useState(false);
  const submit=async event=>{
    event.preventDefault();
    if(disabled||sending||!answer.trim())return;
    setSending(true);
    try {if(await onSubmit(answer.trim()))setAnswer("");}
    finally {setSending(false);}
  };
  return <form className="agent-followup-input" onSubmit={submit}>
    <label htmlFor="agent-followup-answer">回答 Agent 追问</label>
    <textarea id="agent-followup-answer" value={answer} disabled={disabled||sending} onChange={event=>setAnswer(event.target.value)} placeholder="在这里填写对当前追问的补充回答…"/>
    <button type="submit" disabled={disabled||sending||!answer.trim()}>{sending?"提交中…":"提交追问回答"}</button>
  </form>;
}
