import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { questionApi } from "../../services/api";

export default function TrainingQuestionsPage({ notify }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    questionApi.trainingList()
      .then(setList)
      .catch((e) => notify?.(e.message || "加载失败", "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>训练题库</h1>
          <p className="page-desc">AI自动生成的相似题，用于学生自主练习。教师把测试题加入班级题库后，系统会自动生成对应的训练题。</p>
        </div>
      </header>

      {loading ? (
        <p>加载中…</p>
      ) : list.length === 0 ? (
        <div className="panel empty">
          <BookOpen size={32} />
          <p>还没有训练题。把测试题加入班级题库后，系统会自动生成。</p>
        </div>
      ) : (
        <div className="question-grid">
          {list.map((q) => (
            <div key={q.id} className="question-card panel">
              <span className="badge">{q.type}</span>
              <h3>{q.title}</h3>
              <p className="question-content">{q.content}</p>
              <div className="question-meta">
                <span>难度 {q.difficulty}</span>
                <span>{(q.tags || "").replace(/[[\]"]/g, "")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
