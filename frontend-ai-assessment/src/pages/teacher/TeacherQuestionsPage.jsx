import React, { useCallback, useEffect, useState } from "react";
import { Copy, Eye, Plus } from "lucide-react";
import { questionApi } from "../../services/api";
import { Modal, PageTitle } from "../../components/common";
import { SkeletonList } from "../../components/Feedback";
import { EMPTY_QUESTION_FORM, QuestionForm } from "./QuestionForm";
import {
  questionAssessmentPoints,
  questionDimensionLabel,
  questionDimensions,
} from "../../app/taxonomy";

export function TeacherQuestionsPage({ notify }) {
  const [items, setItems] = useState([]);
  const [publicItems, setPublicItems] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const [open, setOpen] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_QUESTION_FORM);
  const [offlineTarget, setOfflineTarget] = useState(null);
  const [offlining, setOfflining] = useState(false);
  const [loading, setLoading] = useState(true);
  // 正在处理的那一行：按钮禁用 + 文案变化，避免连点重复提交
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() =>
    questionApi
      .list()
      .then((rows) => setItems(rows || []))
      .catch((e) => notify(e, "error"))
      .finally(() => setLoading(false)), [notify]);

  useEffect(() => {
    load();
    Promise.all([questionApi.publicList(), questionApi.taxonomy()])
      .then(([publicList, tax]) => {
        setPublicItems(publicList);
        setTaxonomy(tax);
      })
      .catch((e) => notify(e, "error"));
  }, [load, notify]);

  const operate = async (fn, id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await fn(id);
      notify("操作成功", "success");
      await load();
    } catch (e) {
      notify(e, "error");
    } finally {
      setBusyId(null);
    }
  };

  const startCreate = () => {
    setEditing(null);
    setForm(EMPTY_QUESTION_FORM);
    setOpen(true);
  };

  // 编辑就是同一个表单换个初始值：把库里存的 JSON 数组还原成可点选的标签。
  const startEdit = (question) => {
    setEditing(question);
    setForm({
      type: question.type || "DIALOGUE",
      title: question.title || "",
      content: question.content || "",
      options: question.options || "",
      answer: question.answer || "",
      rubric: question.rubric || "",
      difficulty: question.difficulty ?? 1,
      dimensions: questionDimensions(question),
      assessmentPoints: questionAssessmentPoints(question),
    });
    setOpen(true);
  };

  const closeForm = () => {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY_QUESTION_FORM);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.dimensions.length) return notify("请至少选择一个维度", "error");
    if (!form.assessmentPoints.length) return notify("请至少选择一个考察点", "error");
    const payload = { ...form, tags: form.dimensions, difficulty: Number(form.difficulty) };
    delete payload.score;
    try {
      if (editing) {
        await questionApi.update(editing.id, payload);
        notify("题目已更新", "success");
      } else {
        await questionApi.create(payload);
        notify("题目创建成功", "success");
      }
      closeForm();
      load();
    } catch (e) {
      notify(e, "error");
    }
  };

  // 下线会影响到出题，先确认再执行（其余操作可直接生效）
  const confirmOffline = async () => {
    if (!offlineTarget) return;
    setOfflining(true);
    try {
      await questionApi.offline(offlineTarget.id);
      notify("题目已下线，可随时恢复", "success");
      setOfflineTarget(null);
      load();
    } catch (e) {
      notify(e, "error");
    } finally {
      setOfflining(false);
    }
  };

  // 两个表的列宽都写死（colgroup + table-layout: fixed），切公开/私有题库时表格宽度不随内容变化。
  // 「加入班级」不在这里：题目归属班级是班级自己的事，入口放在「我的班级」页的班级题库里。
  return (
    <div className="page">
      <PageTitle
        eyebrow="QUESTION BANK"
        title="题库管理"
        desc="创建、编辑、发布、复制题目；把题目加入班级请到「我的班级」页。"
        action={
          <div className="title-actions">
            <button className="outline" onClick={() => setShowPublic(!showPublic)}>
              <Eye size={16} />
              {showPublic ? "我的题库" : "公开题库"}
            </button>
            <button className="primary" onClick={startCreate}>
              <Plus size={17} /> 创建题目
            </button>
          </div>
        }
      />

      {open && (
        <QuestionForm
          form={form}
          setForm={setForm}
          onSubmit={submit}
          taxonomy={taxonomy}
          submitText={editing ? "保存修改" : "保存题目"}
          onCancel={closeForm}
        />
      )}

      {loading ? (
        <SkeletonList rows={5} columns={4} />
      ) : showPublic ? (
        <div className="table-wrap">
          <table className="table-fixed">
            <colgroup>
              <col style={{ width: "36%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "24%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>公开题目</th>
                <th>维度</th>
                <th>题型</th>
                <th>分值</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {publicItems.map((q) => {
                const dimension = questionDimensionLabel(q);
                return (
                  <tr key={q.id}>
                    {/* 单元格会被裁成省略号，完整内容靠 title 悬停查看 */}
                    <td title={q.title}>{q.title}</td>
                    <td title={dimension}>{dimension}</td>
                    <td>{q.type}</td>
                    <td>100 分</td>
                    <td>
                      <button
                        className="outline"
                        onClick={() => operate(questionApi.copyPublic, q.id)}
                        disabled={busyId === q.id}
                      >
                        <Copy size={14} />
                        {busyId === q.id ? "复制中…" : "复制到我的题库"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-fixed">
            <colgroup>
              <col style={{ width: "27%" }} />
              <col style={{ width: "19%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "24%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>题目</th>
                <th>维度</th>
                <th>类型</th>
                <th>分值</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => {
                const dimension = questionDimensionLabel(q);
                return (
                  <tr key={q.id}>
                    {/* 单元格会被裁成省略号，完整内容靠 title 悬停查看 */}
                    <td>
                      <strong title={q.title}>{q.title}</strong>
                      <small title={q.content}>{q.content}</small>
                    </td>
                    <td title={dimension}>{dimension}</td>
                    <td>{q.type}</td>
                    <td>100 分</td>
                    <td>
                      {q.status === "offline" ? "已下线" : q.visibility === "public" ? "公开" : "私有"}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="text-btn" onClick={() => startEdit(q)}>
                          编辑
                        </button>
                        {q.visibility === "public" ? (
                          <button
                            className="text-btn"
                            onClick={() => operate(questionApi.unpublish, q.id)}
                            disabled={busyId === q.id}
                          >
                            转私有
                          </button>
                        ) : (
                          <button
                            className="text-btn"
                            onClick={() => operate(questionApi.publish, q.id)}
                            disabled={busyId === q.id}
                          >
                            公开
                          </button>
                        )}
                        {q.status === "offline" ? (
                          <button
                            className="text-btn"
                            onClick={() => operate(questionApi.restore, q.id)}
                            disabled={busyId === q.id}
                          >
                            恢复
                          </button>
                        ) : (
                          <button className="text-btn" onClick={() => setOfflineTarget(q)}>
                            下线
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {offlineTarget && (
        <Modal
          title="确认下线这道题？"
          description={offlineTarget.title}
          onClose={() => (offlining ? undefined : setOfflineTarget(null))}
          footer={
            <>
              <span className="modal-hint">下线后可以随时恢复</span>
              <button type="button" className="outline" onClick={() => setOfflineTarget(null)} disabled={offlining}>
                取消
              </button>
              <button type="button" className="danger" onClick={confirmOffline} disabled={offlining}>
                {offlining ? "正在下线…" : "确认下线"}
              </button>
            </>
          }
        >
          <p className="confirm-lead">下线这道题以后：</p>
          <ul className="confirm-list">
            <li>不能再加入任何班级题库；已经加入的虽然还列在班级题库里，但不会再被抽到。</li>
            <li>之后新开始的测评不会抽到它；已经发出去的题不受影响。</li>
            <li>随时可以「恢复」，恢复后重新参与出题。</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
