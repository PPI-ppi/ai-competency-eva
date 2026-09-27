import React, { useCallback, useEffect, useState } from "react";
import { Database, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { classApi, questionApi } from "../../services/api";
import { Field, Modal, PageTitle } from "../../components/common";
import { SkeletonList } from "../../components/Feedback";
import { questionDimensionLabel } from "../../app/taxonomy";

/** 单个班级的管理面板：邀请码、成员、班级题库。 */
function ClassPanel({ item, notify }) {
  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [mine, setMine] = useState([]);
  const [tab, setTab] = useState("members");
  const [bankOpen, setBankOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState([]);
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  // useCallback：它同时是挂载 effect 的依赖和「刷新数据」按钮的处理器，引用要稳定
  const load = useCallback(async () => {
    try {
      const [classroom, memberList, classQuestions, myQuestions] = await Promise.all([
        classApi.detail(item.id),
        classApi.members(item.id),
        classApi.questions(item.id),
        questionApi.list(),
      ]);
      setDetail(classroom);
      setMembers(memberList);
      setQuestions(classQuestions);
      setMine(myQuestions);
    } catch (error) {
      notify(error, "error");
    }
  }, [item.id, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn, message) => {
    try {
      await fn();
      notify(message);
      load();
    } catch (error) {
      notify(error, "error");
    }
  };

  // 候选 = 自己名下、且还没在这个班级里的题；其中已下线的灰显、不可选（后端也不接受）
  const notInClass = mine.filter((q) => !questions.some((inClass) => inClass.id === q.id));
  const addable = notInClass.filter((q) => q.status !== "offline");
  const keywordText = keyword.trim().toLowerCase();
  const matched = notInClass.filter(
    (q) =>
      !keywordText ||
      [q.title, q.content, questionDimensionLabel(q)].some((value) =>
        String(value || "").toLowerCase().includes(keywordText),
      ),
  );
  const selectable = matched.filter((q) => q.status !== "offline");
  const allSelected = selectable.length > 0 && selectable.every((q) => selected.includes(q.id));
  const toggleOne = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelected(allSelected ? [] : selectable.map((q) => q.id));

  // 逐题串行太慢，并发发出去再统计失败数；加完不关弹窗，可以接着挑下一批
  const confirmAdd = async () => {
    if (!selected.length || adding) return;
    setAdding(true);
    const results = await Promise.allSettled(selected.map((id) => classApi.addQuestion(item.id, id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setAdding(false);
    notify(
      failed
        ? `已加入 ${selected.length - failed} 道，${failed} 道失败`
        : `已加入 ${selected.length} 道题目`,
    );
    setSelected([]);
    load();
  };

  const closeBank = () => {
    setBankOpen(false);
    setKeyword("");
    setSelected([]);
  };

  // 从班级题库移除会影响到这个班之后的出题，先确认再执行
  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await classApi.removeQuestion(item.id, removeTarget.id);
      notify("题目已从班级题库移除", "success");
      setRemoveTarget(null);
      load();
    } catch (error) {
      notify(error, "error");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="panel class-management">
      <div className="panel-head">
        <div>
          <h3>{item.name}</h3>
          <p>{item.description || "暂无说明"}</p>
        </div>
        <span className="status completed">{members.length} 名学生</span>
      </div>

      <div className="class-meta">
        <strong>邀请码：{detail?.inviteCode || "加载中…"}</strong>
        <button className="outline" onClick={() => act(() => classApi.refreshInvite(item.id), "邀请码已刷新")}>
          <RefreshCw size={14} />刷新邀请码
        </button>
        <button className="outline" onClick={load}>
          刷新数据
        </button>
      </div>

      <div className="panel-tabs">
        <button type="button" className={tab === "members" ? "active" : ""} onClick={() => setTab("members")}>
          <Users size={14} />班级成员 · {members.length}
        </button>
        <button type="button" className={tab === "questions" ? "active" : ""} onClick={() => setTab("questions")}>
          <Database size={14} />班级题库 · {questions.length}
        </button>
      </div>

      {tab === "members" ? (
        <section className="class-section">
          {members.length ? (
            members.map((member) => (
              <div className="mini-row" key={member.id}>
                {/* 显示学生本人，不要把内部 id 露给老师看；
                    昵称是注册时必填的，缺失时依次退回姓名、账号 */}
                <span>{member.nickname || member.name || member.account || "学生"}</span>
                <button
                  className="text-btn"
                  onClick={() => act(() => classApi.removeMember(item.id, member.studentUserId), "成员已移出")}
                >
                  <Trash2 size={14} />移出
                </button>
              </div>
            ))
          ) : (
            <p>暂无成员</p>
          )}
        </section>
      ) : (
        <section className="class-section">
          <div className="mini-row">
            <span className="bank-hint">
              班级共 {questions.length} 道题 · 你的题库里还有 {addable.length} 道可加入
            </span>
            <button className="outline" onClick={() => setBankOpen(true)}>
              <Plus size={14} />加入题目
            </button>
          </div>
          {questions.length ? (
            questions.map((question) => (
              <div className="mini-row" key={question.id}>
                <span>{question.title}</span>
                <button className="text-btn" onClick={() => setRemoveTarget(question)}>
                  <Trash2 size={14} />移除
                </button>
              </div>
            ))
          ) : (
            <p>还没有题目加入这个班级。</p>
          )}
        </section>
      )}

      {removeTarget && (
        <Modal
          title="确认从班级题库移除？"
          description={removeTarget.title}
          onClose={() => (removing ? undefined : setRemoveTarget(null))}
          footer={
            <>
              <span className="modal-hint">题目仍保留在你的题库里</span>
              <button type="button" className="outline" onClick={() => setRemoveTarget(null)} disabled={removing}>
                取消
              </button>
              <button type="button" className="danger" onClick={confirmRemove} disabled={removing}>
                {removing ? "正在移除…" : "确认移除"}
              </button>
            </>
          }
        >
          <p className="confirm-lead">从这个班级移除以后：</p>
          <ul className="confirm-list">
            <li>这个班级之后的测评不会再抽到它。</li>
            <li>已经发出去的题和历史成绩不受影响。</li>
            <li>题目本身还在你的题库里，需要时可以重新加入。</li>
          </ul>
        </Modal>
      )}

      {bankOpen && (
        <Modal
          title="加入题目到班级题库"
          description="只显示你自己名下的题目；已在这个班级里的不会重复出现，已下线的不能选中。"
          onClose={closeBank}
          footer={
            <>
              <span className="modal-hint">已选 {selected.length} 道</span>
              <button type="button" className="outline" onClick={closeBank} disabled={adding}>
                取消
              </button>
              <button type="button" className="primary" onClick={confirmAdd} disabled={!selected.length || adding}>
                {adding ? "正在加入…" : `加入 ${selected.length} 道`}
              </button>
            </>
          }
        >
          <div className="bank-toolbar">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索题目、内容或维度"
            />
            <button type="button" className="text-btn" onClick={toggleAll} disabled={!selectable.length}>
              {allSelected ? "清空选择" : "全选"}
            </button>
          </div>
          {matched.length ? (
            <div className="bank-list">
              {matched.map((question) => {
                const offline = question.status === "offline";
                return (
                  <label className={`bank-row${offline ? " is-offline" : ""}`} key={question.id}>
                    <input
                      type="checkbox"
                      disabled={offline}
                      checked={selected.includes(question.id)}
                      onChange={() => toggleOne(question.id)}
                    />
                    <span className="bank-item">
                      <strong>{question.title}</strong>
                      <small>
                        {questionDimensionLabel(question)} · {question.type}
                      </small>
                    </span>
                    {offline && <span className="tag">已下线</span>}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="confirm-lead">
              {notInClass.length
                ? "没有匹配的题目。"
                : "你的题库里没有可加入的题目（已经在这个班级里的不会出现在这里）。"}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

export function TeacherClassesPage({ notify }) {
  const [items, setItems] = useState([]);
  const [current, setCurrent] = useState(null);
  const [open, setOpen] = useState(false);
  // weights: { 考察点名: 0-10整数 }，六维分组自动罗列
  const [form, setForm] = useState({ name: "", description: "", weights: {} });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [taxonomy, setTaxonomy] = useState([]);

  // 一次只展示一个班级：列表刷新后仍然停在原来选中的那个，它被删掉或首次加载才落到第一个
  // useCallback：同上，挂载时拉一次，之后由「刷新」按钮复用
  const load = useCallback(async () => {
    try {
      const list = await classApi.managed();
      setItems(list);
      setCurrent((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null));
    } catch (error) {
      notify(error, "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
    questionApi.taxonomy().then(setTaxonomy).catch((error) => notify(error, "error"));
  }, [load]);

  // 打开创建表单时，初始化所有考察点权重为 1
  useEffect(() => {
    if (!open || !taxonomy.length) return;
    const initWeights = {};
    taxonomy.forEach((group) => {
      (group.points || []).forEach((p) => {
        initWeights[p.name] = 1;
      });
    });
    setForm((prev) => ({ ...prev, weights: initWeights }));
  }, [open, taxonomy]);

  const setWeight = (pointName, value) => {
    const w = Math.max(0, Math.min(10, Math.floor(Number(value) || 0)));
    setForm((prev) => ({ ...prev, weights: { ...prev.weights, [pointName]: w } }));
  };

  const create = async (event) => {
    event.preventDefault();
    if (creating) return;
    if (!form.name.trim()) return notify("请填写班级名称", "error");
    setCreating(true);
    try {
      const created = await classApi.create({
        name: form.name,
        description: form.description,
        pointWeights: form.weights,
      });
      notify(`班级创建成功，邀请码：${created.inviteCode}`, "success");
      setOpen(false);
      setForm({ name: "", description: "", weights: {} });
      setCurrent(created.id);
      load();
    } catch (error) {
      notify(error, "error");
    } finally {
      setCreating(false);
    }
  };

  const selected = items.find((item) => item.id === current);

  return (
    <div className="page">
      <PageTitle
        eyebrow="MANAGED CLASSES"
        title="我的班级"
        desc="管理班级、邀请码、成员与班级题库。"
        action={
          <button className="primary" onClick={() => setOpen(!open)}>
            <Plus size={17} /> 创建班级
          </button>
        }
      />

      {open && (
        <form className="panel form-panel" onSubmit={create}>
          <div className="form-grid">
            <Field label="班级名称" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field
              label="班级说明"
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
            />
          </div>
          <div className="field">
            <span>考察点权重（0-10 整数，0 表示该点不纳入总分；发布任务时只读不改）</span>
            {taxonomy.map((group) => (
              <div key={group.dimension} className="weight-group">
                <h4>{group.dimension}</h4>
                <div className="weight-grid">
                  {(group.points || []).map((point) => (
                    <label className="weight-row" key={point.name}>
                      <span className="weight-point-name">{point.name}</span>
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="1"
                        value={form.weights[point.name] ?? 0}
                        onChange={(e) => setWeight(point.name, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="primary" disabled={creating}>
            {creating ? "正在创建…" : "保存并生成邀请码"}
          </button>
        </form>
      )}

      {loading ? (
        <SkeletonList rows={3} columns={2} />
      ) : items.length ? (
        <>
          <div className="class-switcher">
            <span>切换班级 · 共 {items.length} 个</span>
            <div className="chip-group">
              {items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={item.id === current ? "chip active" : "chip"}
                  onClick={() => setCurrent(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          {selected && <ClassPanel key={selected.id} item={selected} notify={notify} />}
        </>
      ) : (
        !open && (
          <div className="large-empty">
            <Users size={30} />
            <h3>还没有创建班级</h3>
            <p>创建班级后，把邀请码发给学生。</p>
            <button className="primary" onClick={() => setOpen(true)}>
              <Plus size={17} />创建第一个班级
            </button>
          </div>
        )
      )}
    </div>
  );
}
