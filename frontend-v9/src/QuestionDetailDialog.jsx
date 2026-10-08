import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { questionApi } from "./api/services";
import { normalizeQuestion } from "./services/portalServices";
import { pointDisplay } from "./assessmentTaxonomy";
import "./question-detail.css";

const typeNames = { SINGLE: "单选题", SINGLE_CHOICE: "单选题", TRUE_FALSE: "判断题", DIALOGUE: "对话题", PRACTICAL: "实操题" };
const displayText = value => String(value ?? "").trim() || "未设置";

export default function QuestionDetailDialog({ question, onClose, action = null }) {
  const dialog = useRef(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const id = question.id || question.questionId;

  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setDetail(null);
    if (!id) {
      setError("缺少题目编号，无法加载完整题目");
      setLoading(false);
      return () => { active = false; };
    }
    questionApi.detail(id).then(row => {
      if (active) setDetail({ ...normalizeQuestion(row), restricted: !Object.hasOwn(row, "answer") && !Object.hasOwn(row, "correctAnswer") && !Object.hasOwn(row, "rubric") });
    }).catch(err => {
      if (active) setError(err?.message || "题目详情加载失败，请重试");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id, attempt]);

  const objective = detail && ["SINGLE", "SINGLE_CHOICE", "TRUE_FALSE"].includes(detail.type);
  // Public catalogue responses intentionally omit answers and rubrics.
  const restricted = detail?.restricted;
  const answer = detail?.answer ? detail.answer : restricted ? "当前公开题目未提供参考答案" : "未设置";
  const rubric = detail?.rubric ? detail.rubric : restricted ? "当前公开题目未提供评分标准" : "未设置";

  return createPortal(
    <dialog ref={dialog} className="question-detail-dialog" aria-labelledby="question-detail-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <header className="question-detail-header"><div><span>QUESTION DETAIL</span><h2 id="question-detail-title">题目详情</h2></div><button type="button" aria-label="关闭题目详情" onClick={onClose} autoFocus><X/></button></header>
      <div className="question-detail-body" aria-busy={loading}>
        {loading ? <p role="status">正在加载完整题目…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重新加载</button></div> : detail && <>
          <h3 className="question-detail-name">{displayText(detail.title)}</h3>
          <dl className="question-detail-meta"><div><dt>题型</dt><dd>{typeNames[detail.type] || displayText(detail.type)}</dd></div><div><dt>难度</dt><dd>{detail.difficulty ? `L${detail.difficulty}` : "未设置"}</dd></div><div><dt>能力维度</dt><dd>{detail.tags.join(" / ") || "未设置"}</dd></div><div><dt>考察点</dt><dd>{detail.assessmentPoints.map(pointDisplay).join(" / ") || "未设置"}</dd></div></dl>
          <section><h3>{detail.type === "PRACTICAL" ? "任务要求" : "完整题干"}</h3><p className="question-detail-text">{displayText(detail.content)}</p></section>
          {objective && <><section><h3>全部选项</h3>{detail.options.length ? <ol className="question-detail-options">{detail.options.map((option, index) => <li key={index}><span>{String.fromCharCode(65 + index)}.</span><p className="question-detail-text">{option}</p></li>)}</ol> : detail.type === "TRUE_FALSE" ? <p>正确 / 错误</p> : <p>未设置</p>}</section><section><h3>正确答案</h3><p className="question-detail-text">{answer}</p></section></>}
          <section><h3>评分标准</h3><p className="question-detail-text">{rubric}</p></section>
        </>}
      </div>
      <footer className="question-detail-footer"><button type="button" onClick={onClose}>关闭</button>{action && <button type="button" className="question-detail-primary" disabled={loading || Boolean(error) || action.disabled} onClick={action.onClick}>{action.label}</button>}</footer>
    </dialog>, document.body,
  );
}
