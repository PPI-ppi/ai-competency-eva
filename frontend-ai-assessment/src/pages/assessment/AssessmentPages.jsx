import React, { useCallback, useEffect, useState } from "react";
import { ArrowRight, Bot, Clock3 } from "lucide-react";
import { PageTitle } from "../../components/common";
import { RadarChart } from "../../components/charts";
import { assessmentApi, questionApi } from "../../services/api";
import { readCurrentAssessment, removeCurrentAssessment } from "../../app/storage";
import { isImeComposing } from "../../app/ime";

// 参考方向：后端给当前题目的基础信息里带的可点选项
const optionsOf = (question) => String(question?.options || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);

export function AssessmentPage({ go, notify }) {
  const [assessment] = useState(readCurrentAssessment);
  // 本次题量：0 表示不限题量。开始测评时由后端写在测评记录里，进度条按它显示「第 x / y 题」。
  const [planned, setPlanned] = useState(() => Number(readCurrentAssessment()?.questionCount) || 0);
  const [items, setItems] = useState([]);
  const [question, setQuestion] = useState(null);
  const [text, setText] = useState("");
  const [followupText, setFollowupText] = useState("");
  const [attachFile, setAttachFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [finalText, setFinalText] = useState("");
  const [sending, setSending] = useState(false);
  // 对话题/实操题提交后，收起右侧工作面板、只留考官栏，确保考官追问看得见；下一题推过来时自动展开。
  const [workspaceVisible, setWorkspaceVisible] = useState(true);
  const [llmItems, setLlmItems] = useState([]);

  const pushQuestion = useCallback((next) => setItems((previous) => [...previous, { kind: "question", id: `q-${next.id}`, text: next.content, answered: false }]), []);

  // 后端通过 SSE 告诉我们当前发生什么：题目、发言片段、某题问完、整场结束
  // 用 useCallback 保持引用稳定：挂载 effect 与发送函数都依赖它，
  // 每次渲染都换新函数会让「只跑一次」的 effect 变成反复执行。
  const handleEvent = useCallback((aiId) => (name, payload) => {
    if (name === "delta") {
      setItems((previous) => previous.map((item) => item.id === aiId ? { ...item, text: `${item.text}${payload.text || ""}` } : item));
    } else if (name === "question") {
      setQuestion(payload);
      setWorkspaceVisible(true);
      pushQuestion(payload);
    } else if (name === "answered") {
      setItems((previous) => previous.map((item) => item.id === `q-${payload.questionId}` ? { ...item, answered: true } : item));
    }
  }, [pushQuestion]);

  useEffect(() => {
    if (!assessment) {
      notify("请先从班级任务开始测评", "error");
      go("classes");
      return;
    }
    (async () => {
      try {
        const data = await assessmentApi.conversation(assessment.id);
        // 已完成的任务不允许再次进入测评：直接打开结果页（一人一次）。
        if (data.assessment?.status && data.assessment.status !== "in_progress") {
          notify("该测评已完成，正在打开结果", "info");
          go("result");
          return;
        }
        // 题干在发题时就写进了对话记录，后端用 questionPrompt 标出哪条是题干，
        // 这里照原样还原成题目气泡（含「本题已答完」的淡化样式）。
        // id 用 q-<题目记录 id>，和实时推送时 pushQuestion 的编号保持一致，
        // 这样继续答题后收到 answered 事件，同一道题也能正确标记为已答完。
        setItems((data.messages || []).map((message) => message.questionPrompt
          ? {
              kind: "question",
              id: `q-${message.assessmentQuestionId}`,
              text: message.content,
              answered: Boolean(message.questionAnswered),
            }
          : {
              kind: "message",
              id: `m-${message.id}`,
              from: message.senderType === "llm"
                ? "llm"
                : message.senderType === "ai" ? "ai" : "student",
              text: message.content,
            }));
        setLlmItems((data.messages || []).filter((m) => !m.questionPrompt && (m.senderType === "llm" || m.senderType === "student")).map((message) => ({
          kind: "message",
          id: `m-${message.id}`,
          from: message.senderType === "llm" ? "llm" : "student",
          text: message.content,
        })));
        setQuestion(data.question || null);
        setPlanned(Number(data.assessment?.questionCount) || 0);
        // 还没有当前题目：让后端通过对话流给出第一道，或者直接收尾。
        // 这里的 finished 必须自己处理——上一轮 SSE 恰好在收尾那刻断掉时，
        // 测评会停在「没有当前题目但仍是 in_progress」，不处理就会一直空着。
        if (!data.question) {
          let finished = false;
          await assessmentApi.chat(assessment.id, "", (name, payload) => {
            if (name === "finished") finished = true;
            else handleEvent("opening")(name, payload);
          });
          if (finished) {
            notify("测评已完成，正在打开结果", "success");
            go("result");
          }
        }
      } catch (error) {
        removeCurrentAssessment();
        notify(`${error.message}，请返回工作台重新开始`, "error");
        go("dashboard");
      }
    })();
  }, [assessment, go, handleEvent, notify]);

  const send = async () => {
    if (!text.trim() || sending || !question) return;
    const value = text.trim();
    const stamp = Date.now();
    const studentId = `student-${stamp}`;
    const aiId = `ai-${stamp}`;
    const isOrdinaryChat = question?.type === "DIALOGUE";
    setText("");
    setSending(true);
    if (isOrdinaryChat) {
      setLlmItems((prev) => [...prev,
        { kind: "message", id: studentId, from: "student", text: value },
        { kind: "message", id: aiId, from: "llm", text: "" },
      ]);
    } else {
      setItems((previous) => [...previous,
        { kind: "message", id: studentId, from: "student", text: value },
        { kind: "message", id: aiId, from: "ai", text: "" },
      ]);
    }
    let finished = false;
    try {
      await assessmentApi.chat(assessment.id, value, (name, payload) => {
        if (name === "finished") finished = true;
        else handleEvent(aiId)(name, payload);
      }, question?.type === "DIALOGUE" ? { action: "chat" } : {});
      // 这一轮没有说话内容（例如这道题已经答完）就别留空气泡
      setItems((previous) => previous.filter((item) => !(item.id === aiId && !item.text)));
      if (finished) {
        notify?.("测评已完成，正在打开结果", "success");
        go("result");
      }
    } catch (error) {
      setText(value);
      setItems((previous) => previous.filter((item) => item.id !== studentId && item.id !== aiId));
      notify(error, "error");
    } finally {
      setSending(false);
    }
  };

  const submitFinal = async () => {
    if (!finalText.trim() || sending || !question) return;
        let value = finalText.trim();
    if (attachFile) value = "[附件: " + attachFile.name + " " + attachFile.url + "]\n" + value;
    const evaluatorId = `evaluator-${Date.now()}`;
    setFinalText("");
    setSending(true);
    setItems((previous) => [...previous, { kind: "message", id: evaluatorId, from: "ai", text: "" }]);
    let finished = false;
    try {
      await assessmentApi.chat(assessment.id, value, (name, payload) => {
        if (name === "finished") finished = true;
        else handleEvent(evaluatorId)(name, payload);
      }, { action: "submit", finalSubmission: value });
      // 实操题提交后收起右侧面板，切回考官栏；对话题保留右侧作答对话框，追问时可继续用。
      if (!isDialogue) {
        setWorkspaceVisible(false);
      }
      if (finished) {
        notify?.("本次测评已完成，正在打开结果", "success");
        go("result");
      }
    } catch (error) {
      setFinalText(value);
      setItems((previous) => previous.filter((item) => item.id !== evaluatorId));
      notify(error, "error");
    } finally {
      setSending(false);
    }
  };

  const sendFollowup = async () => {
    if (!followupText.trim() || sending || !question) return;
    const value = followupText.trim();
    const stamp = Date.now();
    const studentId = `student-followup-${stamp}`;
    const aiId = `ai-followup-${stamp}`;
    setFollowupText("");
    setSending(true);
    setItems((previous) => [...previous,
      { kind: "message", id: studentId, from: "student", text: value },
      { kind: "message", id: aiId, from: "ai", text: "" },
    ]);
    let finished = false;
    try {
      await assessmentApi.chat(assessment.id, value, (name, payload) => {
        if (name === "finished") finished = true;
        else handleEvent(aiId)(name, payload);
      });
      setItems((previous) => previous.filter((item) => !(item.id === aiId && !item.text)));
      if (finished) {
        notify?.("本次测评已完成，正在打开结果", "success");
        go("result");
      }
    } catch (error) {
      setFollowupText(value);
      setItems((previous) => previous.filter((item) => item.id !== studentId && item.id !== aiId));
      notify(error, "error");
    } finally {
      setSending(false);
    }
  };
  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !question || !assessment) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("assessmentId", assessment.id);
      formData.append("assessmentQuestionId", question.id);
      const ext = file.name.split(".").pop().toLowerCase();
      formData.append("artifactType", ["png","jpg","jpeg","gif","webp"].includes(ext) ? "image" : "doc");
      const res = await fetch("/api/agent/files", {
        method: "POST",
        headers: { "X-User-Id": "9" },
        body: formData,
      });
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch(e) { data = { code: -1, message: "服务器返回: " + raw.substring(0,200) }; }
      if (res.ok && data.code === 0) {
        setAttachFile({ name: file.name, url: data.data.fileUrl });
        notify("文件上传成功", "success");
      } else {
        notify(data.message || ("上传失败 HTTP " + res.status), "error");
      }
    } catch (err) {
      notify("上传失败: " + err.message, "error");
    } finally {
      setUploading(false);
    }
  };
  // 中途退出不结束测评：记录保持 in_progress，之后从「测评任务」或「测评记录」点「继续测评」回来。
  // 只有把题目答完（或达到任务题量）由 Agent 自动收尾，才会真正置为已完成。
  const leaveAssessment = () => {
    notify?.("已保存进度，可以随时回来继续", "info");
    go("dashboard");
  };

  const currentOptions = optionsOf(question);
  const isDialogue = question?.type === "DIALOGUE";
  const isPractical = question?.type === "PRACTICAL";
  const currentQuestionText = question?.content
    || items.find((item) => item.kind === "question" && !item.answered)?.text
    || "";
  const evaluatorItems = items.filter((item) => item.kind === "question" || item.from === "ai");
  
  const renderMessage = (item) => (
    <div className={`message ${item.kind === "question" ? `ai question-prompt${item.answered ? " question-answered" : ""}` : item.from}`} key={item.id}>
      <div className="bubble">
        {item.text || (sending && (item.from === "ai" || item.from === "llm") ? "����˼����" : "")}
      </div>
      <small>
        {item.kind === "question"
          ? (item.answered ? "AI ������ �� �����Ѵ���" : "AI ������ �� ��Ŀ")
          : item.from === "llm" ? "DeepSeek"
            : item.from === "ai" ? "AI ������" : "��"}
      </small>
    </div>
  );
  // 进度条：已出题数 ÷ 本次题量。不限题量（planned = 0）时只显示已出题数。
  const askedCount = items.filter((item) => item.kind === "question").length;
  const progressPercent = planned > 0 ? Math.min(100, Math.round((askedCount / planned) * 100)) : 0;
  const progressText = planned > 0
    ? `第 ${Math.min(Math.max(askedCount, 1), planned)} / ${planned} 题`
    : `已出 ${askedCount} 题 · 不限题量`;
  return (
    <div className="assessment-page">
      <div className="assessment-head">
        <button className="back-link" onClick={leaveAssessment}>← 退出（可继续）</button>
        <div className="assessment-progress">
          <strong>统一对话测评</strong>
          <div className="progress-track" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${progressPercent}%` }} />
          </div>
          <small>{progressText}</small>
        </div>
        <div className="time-left"><Clock3 size={16} /> DeepSeek Agent<button className="text-btn" onClick={leaveAssessment}>退出，稍后继续</button></div>
      </div>
      {isPractical && question?.type === "__legacy__" && (
        <section className="practical-question">
          <span className="eyebrow">PRACTICAL TASK</span>
          <h2>{question?.title || "实操题"}</h2>
          <p>{currentQuestionText}</p>
        </section>
      )}
      {(isDialogue || isPractical) && (
        <div className="assessment-workspace">
          <section className="assessment-panel evaluator-panel">
            <div className="panel-heading">
              <span className="ai-symbol"><Bot size={19} /></span>
              <div>
                <strong>AI 测评官</strong>
                <small>负责出题、追问和评分</small>
              </div>
            </div>
            <div className="panel-messages">
              {evaluatorItems.length
                ? evaluatorItems.map(renderMessage)
                : <p className="panel-empty">等待测评官发送题目</p>}
              {sending && <div className="thinking"><span /><span /><span /> AI 测评官正在处理</div>}
            </div>
            {(isDialogue || isPractical) && (
              <div className="composer followup-composer">
                <textarea
                  value={followupText}
                  onChange={(e) => setFollowupText(e.target.value)}
                  placeholder="回复测评官的追问……"
                />
                <div className="composer-foot">
                  <button className="primary" disabled={!followupText.trim() || sending || !question} onClick={sendFollowup}>
                    {sending ? "发送中…" : "回复追问"} <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </section>

          {workspaceVisible && (
          <section className="assessment-panel work-panel">
            {isDialogue ? (
              <>
                <div className="panel-heading">
                  <span className="ai-symbol"><Bot size={19} /></span>
                  <div>
                    <strong>DeepSeek 普通对话</strong>
                    <small>仅用于辅助完成题目，不参与评分</small>
                  </div>
                </div>
                <div className="panel-messages">
                  {llmItems.length
                    ? llmItems.map(renderMessage)
                    : <p className="panel-empty">在这里和 DeepSeek 对话</p>}
                </div>
                <div className="composer side-composer">
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="输入你想咨询 DeepSeek 的内容……"
                  />
                  <div className="composer-foot">
                    <span>{text.length} 字</span>
                    <button className="primary" disabled={!text.trim() || sending || !question} onClick={send}>
                      {sending ? "发送中…" : "发送"} <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="composer final-submission side-composer">
                  <div className="final-submission-title">
                    <strong>提交最终结果</strong>
                    <small>提交后，测评官会结合对话记录和最终结果评分。</small>
                  </div>
                  <textarea
                    value={finalText}
                    onChange={(event) => setFinalText(event.target.value)}
                    placeholder="填写你最终提交给题目的结果……"
                  />
                  <div className="composer-foot">
                    <span>{finalText.length} 字</span>
                    <button className="primary" disabled={!finalText.trim() || sending || !question} onClick={submitFinal}>
                      {sending ? "评分中…" : "提交最终结果"} <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="practical-work-panel">
                <div className="practical-question">
                  <span className="eyebrow">PRACTICAL TASK</span>
                  <h2>{question?.title || "实操题"}</h2>
                  <p>{currentQuestionText}</p>
                </div>
                <div className="composer final-submission practical-submission">
                  <div className="panel-heading">
                    <span className="ai-symbol"><Bot size={19} /></span>
                    <div>
                      <strong>提交实操成果</strong>
                      <small>测评官只根据最终产物或结果评分</small>
                    </div>
                  </div>
                  <textarea
                    value={finalText}
                    onChange={(event) => setFinalText(event.target.value)}
                    placeholder="粘贴或输入最终产物、答案或结果……"
                  />
                  <div className="upload-row">
                    <label className="upload-btn">
                      <input type="file" accept=".doc,.docx,.pdf,.png,.jpg,.jpeg,.txt" onChange={uploadFile} disabled={uploading} style={{display:"none"}} />
                      {uploading ? "上传中…" : attachFile ? "已选: " + attachFile.name : "📎 上传附件"}
                    </label>
                    {attachFile && <button className="text-btn" onClick={() => setAttachFile(null)}>移除</button>}
                  </div>
                  <div className="composer-foot">
                    <span>{finalText.length} 字</span>
                    <button className="primary" disabled={!finalText.trim() || sending || !question} onClick={submitFinal}>
                      {sending ? "评分中…" : "提交成果"} <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
          )}
        </div>
      )}
      {!isDialogue && !isPractical && (
      <div className="conversation">
        <div className="conversation-title"><span className="ai-symbol"><Bot size={19} /></span><div><strong>AI 测评官</strong><small>DeepSeek · 全程统一对话</small></div></div>
        {items.map((item) => <div className={`message ${item.kind === "question" ? `ai question-prompt${item.answered ? " question-answered" : ""}` : item.from}`} key={item.id}><div className="bubble">{item.text || (sending && item.from === "ai" ? "正在思考…" : "")}</div><small>{item.kind === "question" ? (item.answered ? "AI 测评官 · 本题已答完" : "AI 测评官 · 题目") : item.from === "ai" ? "AI 测评官" : "你"}</small></div>)}
        {sending && <div className="thinking"><span /><span /><span /> DeepSeek 正在思考</div>}
      </div>
      )}
      {!isDialogue && !isPractical && (
      <div className="composer">
        {currentOptions.length > 0 && <div className="composer-options"><div className="composer-options-label">参考选项 · 可点击填入，也可以自行组织语言</div><div className="composer-option-list">{currentOptions.map((option) => <button key={option} type="button" onClick={() => setText(option)}>{option}</button>)}</div></div>}
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (isImeComposing(event)) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder={question ? "输入你的回答、理由或补充观点…" : "正在准备题目…"}
        />
        <div className="composer-foot"><span>{text.length} 字 · 开放式回答</span><button className="primary" disabled={!text.trim() || sending || !question} onClick={send}>{sending ? "发送中…" : "发送"} <ArrowRight size={16} /></button></div>
      </div>
      )}
      {isDialogue && question?.type === "__legacy__" && (
        <div className="composer final-submission">
          <div className="final-submission-title">
            <strong>{isPractical ? "提交最终产物或结果" : "提交最终结果"}</strong>
            <small>{isPractical ? "测评 Agent 只根据这里的内容评分，不分析完成过程。" : "提交后，测评 Agent 会结合 DeepSeek 对话记录和最终结果评分。"}</small>
          </div>
          <textarea
            value={finalText}
            onChange={(event) => setFinalText(event.target.value)}
            placeholder={isPractical ? "���������������ճ���������" : "�������������ύ�Ľ������"}
          />
          <div className="composer-foot">
            <span>����������ɺ��ύ</span>
            <button className="primary" disabled={!finalText.trim() || sending || !question} onClick={submitFinal}>
              {sending ? "�����С�" : "�ύ���ⲿ��"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResultPage({ go }) {
  const [data, setData] = useState(null);
  const [taxonomy, setTaxonomy] = useState([]);
  // 用 useState 固定下来：readCurrentAssessment() 每次调用都返回新对象，
  // 直接参与依赖会让 effect 每渲染一轮就重拉一次结果。
  const [assessment] = useState(readCurrentAssessment);
  useEffect(() => {
    if (assessment) assessmentApi.result(assessment.id).then(setData).catch(() => {});
    questionApi.taxonomy().then(setTaxonomy).catch(() => setTaxonomy([]));
  }, [assessment]);

  // 六维雷达图：轴取固定词表（6 个维度），分数取本次测评的维度分；
  // 本次没考到的维度按 0 分画并标注出来，避免被误读成「能力为 0」。
  const axes = taxonomy.length
    ? taxonomy.map((group) => group.dimension)
    : (data?.dimensions || []).map((row) => row.name);
  const scoreMap = new Map((data?.dimensions || []).map((row) => [row.name, Number(row.score)]));
  const values = axes.map((name) => (scoreMap.has(name) ? scoreMap.get(name) : 0));
  const missing = axes.filter((name) => !scoreMap.has(name));
  const latest = data?.assessment;
  const average = latest?.averageScore ?? latest?.totalScore;
  const finished = latest?.status === "completed" || latest?.status === "completed_with_scoring_failure";

  return (
    <div className="page result-page">
      <PageTitle
        eyebrow="ASSESSMENT RESULT"
        title="测评结果"
        desc="结果来自后端 DeepSeek Agent 评分。"
        action={<button className="outline" onClick={() => go("records")}>返回测评记录</button>}
      />
      <section className="score-card">
        <div>
          <span className="eyebrow">OVERALL SCORE</span>
          <div className="score-dash">{average ?? "—"}</div>
          <p>{finished ? "测评已完成" : "测评结果处理中"} · 综合分（六维分平均）</p>
        </div>
        <div className="score-status">
          <span>{data?.hasScoringFailure ? "部分题目评分失败" : `${data?.answers?.length || 0} 道题结果`}</span>
        </div>
      </section>

      <div className="result-grid">
        <section className="panel">
          <h3>六维能力雷达图</h3>
          {axes.length ? (
            <>
              <RadarChart axes={axes} values={values} missing={missing} size={280} emptyText="本次没有可展示的维度分" />
              {missing.length > 0 && (
                <p className="chart-note">灰色标注的维度本次未考察，已按 0 分展示，不代表能力为 0。</p>
              )}
            </>
          ) : (
            <p className="chart-empty">正在加载维度…</p>
          )}
        </section>
        <section className="panel result-advice">
          <h3>学习建议</h3>
                    {(() => {
            const raw = data?.advice;
            if (!raw) return <p>本次测评暂未生成学习建议。</p>;
            try {
              const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
              if (typeof obj === "object" && obj !== null) {
                const keys = Object.keys(obj);
                return keys.map((k) => (
                  <div key={k} className="advice-block">
                    <h4>{k}</h4>
                    <ul>{(Array.isArray(obj[k]) ? obj[k] : [obj[k]]).map((item, i) => <li key={i}>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>)}</ul>
                  </div>
                ));
              }
            } catch(e) {}
            return <p>{raw}</p>;
          })()}
        </section>
      </div>

      <section className="panel result-breakdown">
        <h3>逐题结果</h3>
        {data?.questions?.map((q) => {
          const answer = data.answers?.find((item) => item.assessmentQuestionId === q.id);
          return (
            <div className="answer-row" key={q.id}>
              <strong>{q.sequenceNo}. {q.contentSnapshot}</strong>
              <span>{answer?.resultStatus || "未评分"} · {answer?.score ?? "—"} 分</span>
              <small>{answer?.scoringReason || "暂无评分说明"}</small>
            </div>
          );
        })}
      </section>
    </div>
  );
}
