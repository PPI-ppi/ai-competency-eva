import React from "react";
import { Field } from "../../components/common";
import { DimensionChips, PointChips } from "../../components/PointPicker";
import { findGroup, pointNames } from "../../app/taxonomy";

export const EMPTY_QUESTION_FORM = {
  type: "DIALOGUE",
  title: "",
  content: "",
  options: "",
  answer: "",
  rubric: "",
  difficulty: 2,
  dimensions: [],
  assessmentPoints: [],
};

/**
 * 建题 / 改题表单：同一个表单两种用途，靠外部传入的 form 初始值区分。
 *
 * 维度是受控词表，可以多选；考察点必须落在所选维度之一，杜绝自由输入。
 */
export function QuestionForm({ form, setForm, onSubmit, taxonomy, submitText = "保存题目", onCancel }) {
  const dimensions = form.dimensions || [];

  const toggleDimension = (dimension) => {
    const groupPoints = pointNames(findGroup(taxonomy, dimension));
    if (dimensions.includes(dimension)) {
      setForm({
        ...form,
        dimensions: dimensions.filter((item) => item !== dimension),
        // 去掉这个维度后，它下面的考察点也一起取消
        assessmentPoints: form.assessmentPoints.filter(
          (item) => !groupPoints.includes(item),
        ),
      });
    } else {
      setForm({ ...form, dimensions: [...dimensions, dimension] });
    }
  };

  const togglePoint = (point) =>
    setForm({
      ...form,
      assessmentPoints: form.assessmentPoints.includes(point)
        ? form.assessmentPoints.filter((item) => item !== point)
        : [...form.assessmentPoints, point],
    });

  return (
    <form className="panel form-panel" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="field">
          <span>题型 *</span>
          <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="DIALOGUE">对话题</option>
            <option value="SINGLE">单选题</option>
            <option value="TRUE_FALSE">判断题</option>
          </select>
        </label>
        <Field
          label="难度"
          type="number"
          value={form.difficulty}
          onChange={(value) => setForm({ ...form, difficulty: value })}
        />
      </div>

      <Field
        label="题目标题"
        required
        value={form.title}
        onChange={(value) => setForm({ ...form, title: value })}
      />

      <label className="field">
        <span>题目内容 *</span>
        <textarea
          required
          value={form.content}
          onChange={(event) => setForm({ ...form, content: event.target.value })}
        />
      </label>

      {form.type !== "DIALOGUE" && (
        <>
          <label className="field">
            <span>选项（每行一项）</span>
            <textarea
              value={form.options}
              onChange={(event) => setForm({ ...form, options: event.target.value })}
            />
          </label>
          <Field
            label="标准答案"
            required
            value={form.answer}
            onChange={(value) => setForm({ ...form, answer: value })}
          />
        </>
      )}

      {form.type === "DIALOGUE" && (
        <label className="field">
          <span>评分标准 *</span>
          <textarea
            required
            value={form.rubric}
            onChange={(event) => setForm({ ...form, rubric: event.target.value })}
          />
        </label>
      )}

      <div className="field">
        <span>维度 *（可多选）</span>
        <DimensionChips taxonomy={taxonomy} dimensions={dimensions} onToggle={toggleDimension} />
      </div>

      <div className="field">
        <span>考察点 *（可多选）</span>
        <PointChips
          taxonomy={taxonomy}
          dimensions={dimensions}
          points={form.assessmentPoints}
          onToggle={togglePoint}
        />
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="outline" onClick={onCancel}>
            取消
          </button>
        )}
        <button className="primary">{submitText}</button>
      </div>
    </form>
  );
}
