import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ClipboardList,
  Eye,
  Gauge,
  Play,
  Plus,
  UsersRound,
} from "lucide-react";
import { classApi, questionApi, taskApi, teacherApi } from "../../services/api";
import { Field, Modal, PageTitle } from "../../components/common";
import { SkeletonStats } from "../../components/Feedback";
import { ScopeBody } from "../../components/PointPicker";
import { findGroup, pointNames } from "../../app/taxonomy";

const EMPTY_FORM = {
  classId: "",
  title: "",
  description: "",
  dimensions: [],
  assessmentPoints: [],
};

/** 完整对话记录：按题分组，把学生与 AI 测评官的消息按发生顺序铺开。 */
function Transcript({ questions }) {
  const blocks = questions.filter((item) => (item.messages || []).length);
  if (!blocks.length) return <p className="confirm-lead">这次测评没有留下对话记录。</p>;
  return (
    <div className="transcript">
      {blocks.map((item) => {
        const question = item.question || item;
        return (
          <section className="transcript-block" key={question.id}>
            <header>
              {/* 题干一定会作为这道题的第一条 AI 消息出现在下面：新数据发题时就写进
                  消息表，历史数据由后端按题目快照补一条。这里只留题号，避免显示两遍 */}
              <b>第 {question.sequenceNo} 题</b>
            </header>
            {(item.messages || []).map((message) => (
              <div className={`transcript-msg ${message.senderType}`} key={message.id}>
                <em>{message.senderType === "ai" ? "AI 测评官" : "学生"}</em>
                <p>{message.content}</p>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/**
 * 学生测评详情弹窗：逐题结果 + 完整对话记录两个页签。
 *
 * 对话记录用的是 teacherApi.detail 已经返回的 messages（按题分组），不需要额外接口。
 * 详情是从「学生完成情况」弹窗点进来的，所以底部给一个「返回名单」回到上一层。
 */
function StudentResultModal({ id, taskTitle, onClose, onBack, notify }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("questions");

  useEffect(() => {
    teacherApi
      .detail(id)
      .then(setData)
      .catch((error) => notify(error, "error"));
  }, [id, notify]);

  const student = data?.student;
  const questions = data?.questions || [];
  const score = data?.assessment?.averageScore ?? data?.assessment?.totalScore;
  const who = student?.name || student?.username || "学生";

  return (
    <Modal
      wide
      title="学生测评详情"
      description={[taskTitle, who, score != null ? `综合分 ${score}` : null]
        .filter(Boolean)
        .join(" · ")}
      onClose={onClose}
      footer={
        <>
          <span className="modal-hint">
            {data?.hasScoringFailure ? "含评分失败的题目" : `${questions.length} 道题`}
          </span>
          {onBack && (
            <button type="button" className="outline" onClick={onBack}>
              返回名单
            </button>
          )}
          <button type="button" className="primary" onClick={onClose}>
            关闭
          </button>
        </>
      }
    >
      <div className="tabs">
        <button
          type="button"
          className={tab === "questions" ? "selected" : ""}
          onClick={() => setTab("questions")}
        >
          逐题结果
        </button>
        <button
          type="button"
          className={tab === "transcript" ? "selected" : ""}
          onClick={() => setTab("transcript")}
        >
          对话记录
        </button>
      </div>

      {!data ? (
        <p className="confirm-lead">正在加载…</p>
      ) : tab === "transcript" ? (
        <Transcript questions={questions} />
      ) : questions.length ? (
        questions.map((item) => {
          const question = item.question || item;
          const answer = item.answer;
          return (
            <div className="answer-row" key={question.id}>
              <strong>
                {question.sequenceNo}. {question.contentSnapshot}
              </strong>
              <span>
                状态：{answer?.resultStatus || "未评分"} · 得分：{answer?.score ?? "—"}
              </span>
              <small>{answer?.answerContent || answer?.scoringReason || "暂无作答内容"}</small>
            </div>
          );
        })
      ) : (
        <p className="confirm-lead">这次测评还没有逐题结果。</p>
      )}
    </Modal>
  );
}

export function TeacherTasksPage({ notify }) {
  const [classes, setClasses] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const [open, setOpen] = useState(false);
  // 两个弹窗：resultTask = 学生完成情况名单；detailId = 某个学生的测评详情。
  // 打开详情时先收起名单弹窗（详情里提供「返回名单」），避免两层弹窗叠在一起。
  const [resultTask, setResultTask] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // 任务指标（N18）：已发布 / 进行中 / 参与学生 / 平均完成率
  const [metrics, setMetrics] = useState({ tasks: 0, running: 0, students: 0, completion: 0 });
  // 指标要等好几个接口回来，先显示「—」而不是 0：否则老师会以为真的一题都没有
  const [metricsLoading, setMetricsLoading] = useState(true);

  const load = useCallback(() =>
    classApi
      .managed()
      .then(async (managedClasses) => {
        setClasses(managedClasses);
        const lists = await Promise.all(
          managedClasses.map((item) => taskApi.managed(item.id).catch(() => [])),
        );
        const allTasks = lists
          .flat()
          .map((task) => ({
            ...task,
            className: managedClasses.find((item) => item.id === task.classId)?.name,
          }));
        setTasks(allTasks);

        // 指标依赖「每个任务的学生完成情况」与「每个班级的人数」，
        // 任务和班级数量都不多，一次并发取回后在前端聚合，不新增后端接口。
        const [resultLists, memberLists] = await Promise.all([
          Promise.all(allTasks.map((task) => teacherApi.taskResults(task.id).catch(() => []))),
          Promise.all(managedClasses.map((item) => classApi.members(item.id).catch(() => []))),
        ]);
        const memberCount = new Map(
          managedClasses.map((item, index) => [item.id, memberLists[index].length]),
        );
        const students = new Set();
        let completed = 0;
        let expected = 0;
        let running = 0;
        allTasks.forEach((task, index) => {
          const rows = resultLists[index] || [];
          if (rows.some((row) => row.status === "in_progress")) running += 1;
          rows.forEach((row) => students.add(row.studentId));
          completed += rows.filter(
            (row) => row.status === "completed" || row.status === "completed_with_scoring_failure",
          ).length;
          expected += memberCount.get(task.classId) || 0;
        });
        setMetrics({
          tasks: allTasks.length,
          running,
          students: students.size,
          completion: expected ? Math.round((completed / expected) * 100) : 0,
        });
      })
      .catch((error) => notify(error, "error"))
      .finally(() => setMetricsLoading(false)), [notify]);

  useEffect(() => {
    load();
    questionApi.taxonomy().then(setTaxonomy).catch(() => {});
  }, [load]);

  // 选维度默认带上它下面的全部考察点；取消时把该维度的考察点一起去掉
  const toggleDimension = (dimension) => {
    const groupPoints = pointNames(findGroup(taxonomy, dimension));
    if (form.dimensions.includes(dimension)) {
      setForm({
        ...form,
        dimensions: form.dimensions.filter((item) => item !== dimension),
        assessmentPoints: form.assessmentPoints.filter(
          (item) => !groupPoints.includes(item),
        ),
      });
    } else {
      setForm({
        ...form,
        dimensions: [...form.dimensions, dimension],
        assessmentPoints: [...new Set([...form.assessmentPoints, ...groupPoints])],
      });
    }
  };

  const togglePoint = (point) =>
    setForm({
      ...form,
      assessmentPoints: form.assessmentPoints.includes(point)
        ? form.assessmentPoints.filter((item) => item !== point)
        : [...form.assessmentPoints, point],
    });

  const create = async (event) => {
    event.preventDefault();
    try {
      await taskApi.create(form.classId, {
        ...form,
      });
      notify("测评任务发布成功", "success");
      setOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (error) {
      notify(error, "error");
    }
  };

  const view = async (task) => {
    try {
      setResultTask({ task, rows: await teacherApi.taskResults(task.id) });
    } catch (error) {
      notify(error, "error");
    }
  };

  return (
    <div className="page">
      <PageTitle
        eyebrow="ASSESSMENT TASKS"
        title="测评任务"
        desc="发布任务并查看学生完成情况与结果。"
        action={
          <button className="primary" onClick={() => setOpen(!open)}>
            <Plus size={17} /> 发布任务
          </button>
        }
      />

      {open && (
        <form className="panel form-panel" onSubmit={create}>
          <label className="field">
            <span>所属班级 *</span>
            <select
              required
              value={form.classId}
              onChange={(event) => setForm({ ...form, classId: event.target.value })}
            >
              <option value="">选择班级</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="任务名称" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
          <label className="field">
            <span>介绍</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="一句话说明这次测评要做什么，学生会在任务列表里看到"
            />
            <small className="field-hint">学生端任务列表里显示的就是这段话</small>
          </label>
          <div className="field">
            <span>考察范围（不选表示使用班级全部题目）</span>
            <ScopeBody
              taxonomy={taxonomy}
              dimensions={form.dimensions}
              points={form.assessmentPoints}
              onToggleDimension={toggleDimension}
              onTogglePoint={togglePoint}
            />
          </div>
          <button className="primary">保存并发布</button>
        </form>
      )}

      {tasks.length ? (
        <>
          {metricsLoading ? (
            <SkeletonStats count={4} />
          ) : (
            <section className="task-metrics">
              <article>
                <ClipboardList />
                <span>已发布任务<b>{metrics.tasks}</b></span>
              </article>
              <article>
                <Play />
                <span>进行中任务<b>{metrics.running}</b></span>
              </article>
              <article>
                <UsersRound />
                <span>参与学生<b>{metrics.students}</b></span>
              </article>
              <article>
                <Gauge />
                <span>平均完成率<b>{metrics.completion}%</b></span>
              </article>
            </section>
          )}
          <div className="task-list">
          {tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <div>
                <h3>{task.title}</h3>
                <p>{task.description || "暂无任务说明"}</p>
              </div>
              <div className="task-detail">
                <span>{task.className}</span>
              </div>
              <button className="outline" onClick={() => view(task)}>
                <Eye size={15} />查看结果
              </button>
            </div>
          ))}
          </div>
        </>
      ) : (
        <div className="large-empty">
          <BookOpen size={30} />
          <h3>还没有发布任务</h3>
          <p>创建班级、题目并加入班级题库后即可发布任务。</p>
        </div>
      )}

      {/* 学生完成情况：弹窗 */}
      {resultTask && !detailId && (
        <Modal
          wide
          title="学生完成情况"
          description={`${resultTask.task.title}${
            resultTask.task.className ? ` · ${resultTask.task.className}` : ""
          } · 共 ${resultTask.rows.length} 份测评`}
          onClose={() => setResultTask(null)}
          footer={
            <>
              <span className="modal-hint">点「查看详情」可以看逐题结果与完整对话记录</span>
              <button type="button" className="primary" onClick={() => setResultTask(null)}>
                关闭
              </button>
            </>
          }
        >
          {resultTask.rows.length ? (
            resultTask.rows.map((row) => {
              const done = row.status === "completed" || row.status === "completed_with_scoring_failure";
              return (
                <div className="mini-row" key={row.assessmentId}>
                  <span>
                    {/* 一律显示学生昵称，不再用内部 id 兜底 */}
                    {row.studentNickname || row.studentName || row.studentAccount || "学生"}
                    {row.abilityLevel ? ` · ${row.abilityLevel}` : ""} ·{" "}
                    {done ? `已完成，${row.averageScore ?? row.totalScore ?? "—"} 分` : "进行中"}
                  </span>
                  <button
                    type="button"
                    className="text-btn"
                    onClick={() => setDetailId(row.assessmentId)}
                  >
                    查看详情
                  </button>
                </div>
              );
            })
          ) : (
            <p className="confirm-lead">暂无学生参加此任务。</p>
          )}
        </Modal>
      )}

      {/* 学生测评详情：弹窗（逐题结果 / 对话记录） */}
      {detailId && (
        <StudentResultModal
          id={detailId}
          taskTitle={resultTask?.task?.title}
          // 关闭 = 全部收起；返回名单 = 只退回上一层
          onClose={() => {
            setDetailId(null);
            setResultTask(null);
          }}
          onBack={() => setDetailId(null)}
          notify={notify}
        />
      )}
    </div>
  );
}
