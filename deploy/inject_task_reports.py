# -*- coding: utf-8 -*-
"""伪造 3 份任务报告（呕 uid=9 × 组织1 class=37）：低46.28/中68.47/高87.52
3 个 ended 任务（教师 uid=48），每任务 1 份测评（唯一键 task_id+student_user_id）
时间线：9-15 / 9-22 / 9-29（夹在自主测评 234/235/236 之间，画像 latest 仍为 236=85.23）
"""
import io, sys, json, os, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
UID, CLS, TID = 9, 37, 48
POINTS = [
    ("AI基本概念理解", "AI基础认知", 4), ("数据影响AI输出的认知", "AI基础认知", 3),
    ("AI决策的基本逻辑", "AI基础认知", 3), ("AI发展历程认知", "AI基础认知", 2),
    ("AI能力边界认知", "AI基础认知", 3), ("AI社会影响认知", "AI基础认知", 1),
    ("批判性看待AI", "AI基础认知", 3), ("提示词书写", "提示词工程", 10),
    ("评估AI结果", "AI结果评估与优化", 3), ("优化AI结果", "AI结果评估与优化", 3),
    ("隐私保护意识", "AI伦理与合规", 3), ("合规意识", "AI伦理与合规", 4),
    ("偏见及有害内容识别", "AI伦理与合规", 5), ("版权与知识产权认知", "AI伦理与合规", 4),
    ("问责意识", "AI伦理与合规", 2), ("与AI协作解决问题", "人机协同解决问题", 10),
]
DIMS = ["AI基础认知", "提示词工程", "AI工具使用", "AI结果评估与优化", "人机协同解决问题", "AI伦理与合规"]
CLASS_WEIGHTS = dict((p, w) for p, _, w in POINTS)

def dim_avg(scores, dim):
    pts = [v for (p, d, v) in scores if d == dim]
    return round(sum(pts) / len(pts), 2) if pts else 0.0

def esc(x):
    return "NULL" if x is None else "'" + str(x).replace("\\", "\\\\").replace("'", "''") + "'"

TASKS = [
    dict(key="A", title="AI 应用基础摸底", score=46.28, level="L2",
         started="2026-09-15 09:00:00", completed="2026-09-15 09:32:00", deadline="2026-09-14 23:59:00", qn=3,
         desc="面向组织成员的基础能力摸底任务，覆盖 AI 基础认知与伦理合规。",
         advice_overall="本次组织任务《AI 应用基础摸底》中，受测者总分为46.28分，能力等级为L2。已初步掌握AI基本概念，但在社会影响认知与隐私保护方面仍需加强，建议结合真实场景持续练习。",
         tests=[
             ("AI基本概念理解", "AI基础认知", 4, 0.4850, "SINGLE_CHOICE", 330,
              "人工智能技术的核心目标是什么？",
              '["A. 完全替代人类决策","B. 模拟与扩展人类智能以辅助完成任务","C. 让机器拥有自我意识","D. 加速信息在网络中的传播"]',
              "B", "能正确理解AI辅助人类的目标定位。"),
             ("AI社会影响认知", "AI基础认知", 1, 0.4312, "DIALOGUE", 542,
              "结合你的理解，分析生成式AI对教育行业可能带来的积极与消极影响，并说明你的观点。",
              None, None, "观点成立但论证较浅，正反影响列举不够充分，缺乏实例支撑。"),
             ("隐私保护意识", "AI伦理与合规", 3, 0.4437, "SINGLE_CHOICE", 329,
              "学校使用AI工具批改学生作业时，以下哪种做法最符合隐私保护原则？",
              '["A. 将学生真实姓名与成绩直接上传给第三方AI","B. 对作业内容脱敏后再交给AI处理","C. 随意共享学生数据以提升效率","D. 无需告知学生即可使用其数据"]',
              "B", "能识别脱敏处理是隐私保护的关键手段，但对数据共享边界的理解有待深化。"),
         ]),
    dict(key="B", title="提示词工程实战", score=68.47, level="L3",
         started="2026-09-22 14:00:00", completed="2026-09-22 14:36:00", deadline="2026-09-21 23:59:00", qn=4,
         desc="考察提示词设计、人机协作与结果评估能力，完成一次真实AI协作任务。",
         advice_overall="本次组织任务《提示词工程实战》中，受测者总分为68.47分，能力等级为L3。提示词设计与AI协作表现良好，结果评估环节基本达标，建议在复杂场景下加强约束条件设置与结果核验。",
         tests=[
             ("提示词书写", "提示词工程", 10, 0.6900, "DIALOGUE", 541,
              "请为「撰写一份AI产品周报」设计高质量提示词，要求包含角色、任务、输出格式等要素，并说明设计思路。",
              None, None, "提示词要素完整，结构清晰，体现了良好的提示词工程素养。"),
             ("与AI协作解决问题", "人机协同解决问题", 10, 0.6720, "PRACTICAL", 554,
              "使用AI工具为班级策划一次「AI主题科技节」活动方案，提交成果（含流程、分工、预算），并说明人机协作过程。",
              None, None, "方案可执行，人机分工明确；协作迭代过程描述较简略。"),
             ("AI基本概念理解", "AI基础认知", 4, 0.7050, "SINGLE_CHOICE", 331,
              "大语言模型生成回答的基本原理，以下描述最准确的是？",
              '["A. 基于预训练概率预测下一个词元","B. 从互联网实时检索答案","C. 依靠人工编写规则库回答","D. 通过数据库精确匹配返回"]',
              "A", "对LLM基本原理理解准确。"),
             ("评估AI结果", "AI结果评估与优化", 3, 0.6823, "SINGLE_CHOICE", 332,
              "当AI生成的方案包含明显事实错误时，正确的处理方式是？",
              '["A. 直接采用，AI生成内容无需人工审核","B. 全部推翻重做","C. 人工核验事实并修正后再使用","D. 仅修改错别字后使用"]',
              "C", "能认识到AI输出需人工核验，处理方式正确。"),
         ]),
    dict(key="C", title="人机协同综合挑战", score=87.52, level="L4",
         started="2026-09-29 10:00:00", completed="2026-09-29 10:42:00", deadline="2026-09-28 23:59:00", qn=5,
         desc="综合考察AI理解、提示词工程、结果优化与人机协同能力的高阶任务。",
         advice_overall="本次组织任务《人机协同综合挑战》中，受测者总分为87.52分，能力等级为L4。AI基础认知、提示词工程与人机协同能力表现突出，结果优化环节扎实，问责意识略有提升空间，整体已达较高AI应用素养。",
         tests=[
             ("AI基本概念理解", "AI基础认知", 4, 0.8850, "DIALOGUE", 543,
              "请解释什么是大语言模型，并举例说明它在教育场景中的三种典型应用方式。",
              None, None, "解释准确深入，应用举例恰当，条理清晰。"),
             ("提示词书写", "提示词工程", 10, 0.8800, "DIALOGUE", 544,
              "请设计一个用于「AI产品功能说明文档」撰写的提示词，并给出你的优化过程。",
              None, None, "提示词专业度高，优化过程完整，体现高阶提示词工程能力。"),
             ("优化AI结果", "AI结果评估与优化", 3, 0.8650, "SINGLE_CHOICE", 332,
              "当AI生成的代码存在性能问题时，以下哪种优化策略最有效？",
              '["A. 直接重写全部代码","B. 定位瓶颈并针对性优化，必要时重构关键模块","C. 忽略性能问题只关注功能","D. 增加更多注释"]',
              "B", "对性能优化流程理解正确。"),
             ("与AI协作解决问题", "人机协同解决问题", 10, 0.8920, "PRACTICAL", 555,
              "使用AI工具为社团设计一份纳新宣传方案（含海报文案与短视频脚本），提交成果并说明人机协作过程。",
              None, None, "成果质量高，人机协作过程完整（需求拆解、多轮迭代、人工把关）。"),
             ("问责意识", "AI伦理与合规", 2, 0.7629, "SINGLE_CHOICE", 329,
              "AI系统造成不良后果时，关于责任归属，以下哪种认识最合理？",
              '["A. 完全由AI系统负责","B. 由使用者、开发者与部署方按过错共同承担","C. 无人需要负责，是技术问题","D. 一律由使用者负责"]',
              "B", "能认识到责任多方共担，对具体机制表述可更精确。"),
         ]),
]

SQL = ["SET NAMES utf8mb4;", "BEGIN;"]
for idx, rep in enumerate(TASKS):
    tests = rep["tests"]
    wsum = sum(w for (_, _, w, *_) in tests)
    tsum = sum(t * w for (_, _, w, t, *_) in tests)
    total = round(100.0 * tsum / wsum, 2)
    assert abs(total - rep["score"]) < 0.02, f'{total} vs {rep["score"]}'
    label = rep["key"]
    n = len(tests)

    # 1) 任务
    SQL.append(
        "INSERT INTO assessment_tasks(class_id,teacher_user_id,title,description,estimated_duration,question_count,dimensions,assessment_points,status,created_at,updated_at,point_weights,task_type,deadline_at,ended_at) "
        f"VALUES({CLS},{TID},{esc(rep['title'])},{esc(rep['desc'])},60,{n},{esc(json.dumps([d for (p,d,w,*_) in tests], ensure_ascii=False))},{esc(json.dumps([p for (p,d,w,*_) in tests], ensure_ascii=False))},'ended','{rep['started']}','{rep['completed']}',{esc(json.dumps(CLASS_WEIGHTS, ensure_ascii=False))},'NORMAL','{rep['deadline']}','{rep['completed']}');"
    )
    SQL.append(f"SET @tk_{label}=LAST_INSERT_ID();")

    # 2) 测评
    dims_field = json.dumps({d: dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d) for d in DIMS}, ensure_ascii=False)
    pts_field = json.dumps([p for (p, d, w, *_) in tests], ensure_ascii=False)
    weights_field = json.dumps(dict((p, w) for (p, d, w, *_) in tests), ensure_ascii=False)
    adv = {
        "overall": rep["advice_overall"],
        "dimensions": {d: (f"本次任务中该维度得分 {dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d)} 分，表现良好。" if dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d) > 0 else "本次任务未涉及该维度的考察。") for d in DIMS},
        "points": [{"name": p, "status": "converged", "comment": r} for (p, d, w, t, ty, qid, c, o, a, r) in tests],
        "suggestions": ["针对薄弱考察点开展专项训练", "在提示词与结果评估环节增加迭代优化练习", "定期完成组织任务与自主测评，跟踪能力成长"],
    }
    adv_json = json.dumps(adv, ensure_ascii=False)
    report_json = json.dumps({"assessmentId": "TASK-" + label, "overall": adv_json, "dimensions": {}, "points": [], "suggestions": []}, ensure_ascii=False)
    SQL.append(
        "INSERT INTO assessments(task_id,class_id,student_user_id,dimensions,assessment_points,question_count,status,started_at,completed_at,total_score,average_score,ability_level,advice,created_at,updated_at,point_weights,report_json) "
        f"VALUES(@tk_{label},{CLS},{UID},{esc(dims_field)},{esc(pts_field)},{n},'completed','{rep['started']}','{rep['completed']}',{total},{total},'{rep['level']}',{esc(adv_json)},'{rep['started']}','{rep['completed']}',{esc(weights_field)},{esc(report_json)});"
    )
    SQL.append(f"SET @aid_{label}=LAST_INSERT_ID();")

    # 3) states 16 点
    tested = {p: (d, w, t) for (p, d, w, t, *_) in tests}
    for p, d, w in POINTS:
        if p in tested:
            t = tested[p][2]
            st = f"INSERT INTO assessment_point_states(assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,follow_up_count,status,last_difficulty,created_at,updated_at) VALUES(@aid_{label},{CLS},'{d}','{p}',{t:.4f},0.7000,1.00,1,0,'converged',0.45,'{rep['started']}','{rep['completed']}');"
        else:
            st = f"INSERT INTO assessment_point_states(assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,follow_up_count,status,last_difficulty,created_at,updated_at) VALUES(@aid_{label},{CLS},'{d}','{p}',0.0000,0.0000,0.00,0,0,'removed',NULL,'{rep['started']}','{rep['completed']}');"
        SQL.append(st)

    # 4) questions + answers
    for seq, (p, d, w, t, ty, qid, content, opts, ans, reason) in enumerate(tests, start=1):
        SQL.append(
            "INSERT INTO assessment_questions(assessment_id,question_id,sequence_no,type,content_snapshot,options_snapshot,answer_snapshot,rubric_snapshot,difficulty_snapshot,tags_snapshot,assessment_points_snapshot,status,finished,sent_at,answered_at,point_name,dimension_name,difficulty_value,r_initial,r_final,followed_up,follow_up_turns) "
            f"VALUES(@aid_{label},{qid},{seq},'{ty}',{esc(content)},{esc(opts)},{esc(ans)},'按考察点评分',3,'[\"AI\"]','[\"{p}\"]','answered',1,'{rep['started']}','{rep['completed']}','{p}','{d}',0.45,0.8,{t:.4f},0,0);"
        )
        SQL.append(f"SET @aq_{label}_{seq}=LAST_INSERT_ID();")
        evidence = '{"evidence":"answered"}'
        SQL.append(
            "INSERT INTO assessment_answers(assessment_question_id,answer_content,answer_count,result_status,score,scoring_reason,scoring_evidence,confidence,submitted_at,scored_at,clarity) "
            f"VALUES(@aq_{label}_{seq},{esc('本题作答内容：' + content[:40])},1,'scored',{round(t * 100, 2)},{esc(reason)},'{evidence}',0.7000,'{rep['completed']}','{rep['completed']}','clear');"
        )

    # 5) dimension_scores 6 条（created_at=completed_at，真实落库行为）
    for d in DIMS:
        sc = dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d)
        qc = sum(1 for (p, dd, w, t, *_) in tests if dd == d)
        SQL.append(
            f"INSERT INTO assessment_dimension_scores(assessment_id,class_id,student_user_id,dimension,score,question_count,created_at,comment) VALUES(@aid_{label},{CLS},{UID},'{d}',{sc},{qc},'{rep['completed']}',{esc('该维度任务表现评述')});"
        )

    # 6) point_scores 16 点
    for p, d, w in POINTS:
        sc = round(tested[p][2] * 100, 2) if p in tested else 0.00
        qc = 1 if p in tested else 0
        verdict = 'mastered' if sc >= 60 else ('learning' if sc > 0 else None)
        SQL.append(
            f"INSERT INTO assessment_point_scores(assessment_id,class_id,student_user_id,dimension,assessment_point,score,question_count,created_at,comment,verdict) VALUES(@aid_{label},{CLS},{UID},'{d}','{p}',{sc},{qc},'{rep['completed']}',{esc('任务考察点评述')},{esc(verdict)});"
        )

SQL.append("COMMIT;")
sql_text = "\n".join(SQL)

HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
sftp = c.open_sftp()
with sftp.open('/tmp/inject_task_reports.sql', 'w') as f:
    f.write(sql_text.encode('utf-8'))
sftp.close()
_, out, err = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment < /tmp/inject_task_reports.sql", timeout=180)
print('执行输出:', out.read().decode('utf-8', 'replace').strip()[:500])
print('执行错误:', err.read().decode('utf-8', 'replace').strip()[:1000])
_, o, _ = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -N -e \"SELECT a.id,t.title,a.total_score,a.ability_level,a.completed_at FROM assessments a JOIN assessment_tasks t ON a.task_id=t.id WHERE a.student_user_id=9 AND a.class_id=37 AND a.task_id IS NOT NULL ORDER BY a.id DESC LIMIT 5\"", timeout=60)
print('== 任务测评 ==')
print(o.read().decode('utf-8', 'replace').strip())
_, o, _ = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -N -e \"SELECT id,class_id,title,status,teacher_user_id FROM assessment_tasks WHERE class_id=37 ORDER BY id DESC LIMIT 5\"", timeout=60)
print('== 组织1任务 ==')
print(o.read().decode('utf-8', 'replace').strip())
c.close()
print('DONE')
