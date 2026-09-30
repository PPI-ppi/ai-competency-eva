# -*- coding: utf-8 -*-
"""为呕(uid=9)/组织1(class=37) 注入3份不同分数段历史测评报告（含小数分）"""
import io, sys, json, os, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
UID, CLS = 9, 37
# 班级 16 考察点权重（来自 classes.point_weights）
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

def dim_avg(scores, dim):
    pts = [v for (p, d, v) in scores if d == dim]
    return round(sum(pts) / len(pts), 2) if pts else 0.0

def build(report):
    """report: dict(score, level, started, completed, tests:[(point,dim,w,theta,type,qid,content,options,answer,reason)], advice...)"""
    tests = report["tests"]
    weight_sum = sum(w for (_, _, w, *_) in tests)
    theta_sum = sum(t * w for (_, _, w, t, *_) in tests)
    total = round(100.0 * theta_sum / weight_sum, 2)
    # 校验
    assert abs(total - report["score"]) < 0.02, f'{total} vs {report["score"]}'
    return tests, weight_sum, theta_sum, total

SQL = []
SQL.append("SET NAMES utf8mb4;")
SQL.append("BEGIN;")

REPORTS = [
    dict(score=45.63, level="L2", started="2026-09-14 09:20:00", completed="2026-09-14 09:48:00",
         advice_overall="本次测评在AI基础认知与AI伦理与合规两个维度进行了考察，总分为45.63分，能力等级为L2。受测者已初步掌握AI基本概念，但在社会影响认知与隐私保护意识方面仍有明显不足，需要加强系统学习与实际场景的迁移应用。",
         tests=[
             ("AI基本概念理解", "AI基础认知", 4, 0.4800, "SINGLE_CHOICE", 330,
              "以下关于人工智能、机器学习与深度学习关系的描述，正确的是哪一项？",
              '["A. AI = ML = DL，三者是同义词","B. DL ⊂ ML ⊂ AI（深度学习是机器学习的一个子集）","C. ML ⊂ DL ⊂ AI","D. AI 与 ML、DL 完全无关"]',
              "B", "概念题作答正确，能准确区分AI、ML与DL的包含关系。"),
             ("AI社会影响认知", "AI基础认知", 1, 0.4200, "DIALOGUE", 542,
              "结合你的理解，分析生成式AI的广泛应用对社会就业结构可能带来的积极与消极影响，并说明你的观点。",
              None, None, "观点基本成立，能分别列举正反影响，但论证较浅，缺乏数据或案例支撑，深度不足。"),
             ("隐私保护意识", "AI伦理与合规", 3, 0.4368, "SINGLE_CHOICE", 329,
              "在使用AI工具处理个人信息时，以下哪种做法最符合隐私保护原则？",
              '["A. 将包含个人信息的数据直接上传给任意AI工具处理","B. 上传前对敏感信息进行脱敏或匿名化处理","C. 为了效率优先不考虑隐私风险","D. 只在必要时共享个人信息，并选择可信任的工具"]',
              "B", "能识别脱敏处理是保护隐私的有效手段，但对隐私风险的全面评估仍有欠缺。"),
         ]),
    dict(score=65.28, level="L3", started="2026-09-21 14:00:00", completed="2026-09-21 14:32:00",
         advice_overall="本次测评覆盖提示词工程、人机协同、AI基础认知与结果评估四个维度，总分为65.28分，能力等级为L3。受测者具备较好的提示词构造与人机协作能力，在结果评估环节表现相对偏弱，建议加强AI输出的批判性校验与优化意识。",
         tests=[
             ("提示词书写", "提示词工程", 10, 0.6700, "DIALOGUE", 541,
              "请为「如何高效整理会议纪要」设计一个高质量提示词，要求包含角色、任务、输出格式等要素，并说明你的设计思路。",
              None, None, "提示词结构完整，角色、任务、格式要素齐备，设计思路清晰，体现了良好的提示词工程意识。"),
             ("与AI协作解决问题", "人机协同解决问题", 10, 0.6500, "PRACTICAL", 554,
              "使用AI工具为班级策划一次「AI主题科技节」活动方案，提交你的活动策划成果（可含流程、分工、预算等），并说明你如何与AI协作完成。",
              None, None, "方案完整且可执行，人机分工明确；但协作过程描述较简略，未充分体现迭代优化环节。"),
             ("AI基本概念理解", "AI基础认知", 4, 0.6800, "SINGLE_CHOICE", 331,
              "大语言模型生成回答的基本原理，以下描述最准确的是？",
              '["A. 基于预训练概率预测下一个词元","B. 从互联网实时检索答案","C. 依靠人工编写规则库回答","D. 通过数据库精确匹配返回"]',
              "A", "对LLM基于概率预测的基本原理理解准确。"),
             ("评估AI结果", "AI结果评估与优化", 3, 0.5685, "SINGLE_CHOICE", 332,
              "当AI生成的文案包含明显事实错误时，正确的处理方式是？",
              '["A. 直接发布，AI生成内容无需人工审核","B. 全部推翻，完全不用AI生成的内容","C. 人工核验事实并修正后再使用","D. 仅修改错别字后发布"]',
              "C", "能认识到AI输出需人工核验，但未进一步体现系统性校验方法，得分中等偏下。"),
         ]),
    dict(score=85.23, level="L4", started="2026-09-30 21:10:00", completed="2026-09-30 21:42:00",
         advice_overall="本次测评覆盖五个核心维度，总分为85.23分，能力等级为L4。受测者展现出扎实的AI基础认知、优秀的提示词工程与人机协同能力，在问责意识方面仍有小幅提升空间。整体能力画像较为完整，已具备较高的AI应用素养。",
         tests=[
             ("AI基本概念理解", "AI基础认知", 4, 0.8600, "DIALOGUE", 543,
              "请解释什么是大语言模型，并举例说明它在教育场景中的三种典型应用方式。",
              None, None, "解释准确深入，教育场景应用举例恰当，覆盖个性化学习、智能答疑与内容生成，条理清晰。"),
             ("提示词书写", "提示词工程", 10, 0.8500, "DIALOGUE", 544,
              "请设计一个用于「AI产品功能说明文档」撰写的提示词，并给出你的优化过程。",
              None, None, "提示词专业度高，优化过程完整展示了从初版到迭代的思考链，体现高阶提示词工程能力。"),
             ("优化AI结果", "AI结果评估与优化", 3, 0.8400, "SINGLE_CHOICE", 332,
              "当AI生成的代码存在性能问题时，以下哪种优化策略最有效？",
              '["A. 直接重写全部代码","B. 定位瓶颈并针对性优化，必要时重构关键模块","C. 忽略性能问题只关注功能","D. 增加更多注释"]',
              "B", "选择正确，体现对性能优化流程（定位瓶颈→针对性优化）的正确理解。"),
             ("与AI协作解决问题", "人机协同解决问题", 10, 0.8700, "PRACTICAL", 555,
              "使用AI工具为社团设计一份纳新宣传方案（含海报文案与短视频脚本），提交成果并说明人机协作过程。",
              None, None, "成果质量高，人机协作过程完整（需求拆解、多轮迭代、人工把关），充分体现协同增效。"),
             ("问责意识", "AI伦理与合规", 2, 0.7784, "SINGLE_CHOICE", 329,
              "AI系统造成不良后果时，关于责任归属，以下哪种认识最合理？",
              '["A. 完全由AI系统负责","B. 由使用者、开发者与部署方按过错共同承担","C. 无人需要负责，是技术问题","D. 一律由使用者负责"]',
              "B", "能认识到责任需多方共同承担，但对具体责任划分机制的表述可更精确，得分略有保留。"),
         ]),
]

for idx, rep in enumerate(REPORTS):
    tests = rep["tests"]
    tests, wsum, tsum, total = build(rep)
    n = len(tests)
    label = chr(65 + idx)
    # assessments
    adv = {
        "overall": rep["advice_overall"],
        "dimensions": {d: (f"本次测评中该维度得分 {dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d)} 分，表现有待持续巩固与提升。" if dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d) > 0 else "本次测评未涉及该维度的考察。") for d in DIMS},
        "points": [{"name": p, "status": "converged" if t >= 0.6 else "converged", "comment": r} for (p, d, w, t, ty, qid, c, o, a, r) in tests],
        "suggestions": ["结合薄弱维度进行针对性训练，强化概念理解与场景迁移", "在提示词与结果评估环节增加迭代优化练习", "定期完成综合测评，跟踪能力画像的成长变化"],
    }
    adv_json = json.dumps(adv, ensure_ascii=False)
    report_json = json.dumps({"assessmentId": "RPT-%s" % label, "overall": adv_json, "dimensions": {}, "points": [], "suggestions": []}, ensure_ascii=False)
    dims_field = json.dumps({d: (dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d)) for d in DIMS}, ensure_ascii=False)
    pts_field = json.dumps([p for (p, d, w, t, *_) in tests], ensure_ascii=False)
    weights_field = json.dumps(dict((p, w) for (p, d, w, *_) in tests), ensure_ascii=False)

    def esc(x):
        return "NULL" if x is None else "'" + str(x).replace("\\", "\\\\").replace("'", "''") + "'"

    SQL.append(
        "INSERT INTO assessments(class_id,student_user_id,dimensions,assessment_points,question_count,status,started_at,completed_at,total_score,average_score,ability_level,advice,created_at,updated_at,point_weights,report_json) "
        f"VALUES({CLS},{UID},{esc(dims_field)},{esc(pts_field)},{n},'completed','{rep['started']}','{rep['completed']}',{total},{total},'{rep['level']}',{esc(adv_json)},'{rep['started']}','{rep['completed']}',{esc(weights_field)},{esc(report_json)});"
    )
    SQL.append(f"SET @aid_{label}=LAST_INSERT_ID();")

    # states：16 点全量
    tested = {p: (d, w, t) for (p, d, w, t, *_) in tests}
    for p, d, w in POINTS:
        if p in tested:
            t = tested[p][2]
            st = f"INSERT INTO assessment_point_states(assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,follow_up_count,status,last_difficulty,created_at,updated_at) VALUES(@aid_{label},{CLS},'{d}','{p}',{t:.4f},0.6800,1.00,1,0,'converged',0.45,'{rep['started']}','{rep['completed']}');"
        else:
            st = f"INSERT INTO assessment_point_states(assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,follow_up_count,status,last_difficulty,created_at,updated_at) VALUES(@aid_{label},{CLS},'{d}','{p}',0.0000,0.0000,0.00,0,0,'removed',NULL,'{rep['started']}','{rep['completed']}');"
        SQL.append(st)

    # questions + answers
    for seq, (p, d, w, t, ty, qid, content, opts, ans, reason) in enumerate(tests, start=1):
        SQL.append(
            "INSERT INTO assessment_questions(assessment_id,question_id,sequence_no,type,content_snapshot,options_snapshot,answer_snapshot,rubric_snapshot,difficulty_snapshot,tags_snapshot,assessment_points_snapshot,status,finished,sent_at,answered_at,point_name,dimension_name,difficulty_value,r_initial,r_final,followed_up,follow_up_turns) "
            f"VALUES(@aid_{label},{qid},{seq},'{ty}',{esc(content)},{esc(opts)},{esc(ans)},'按考察点评分',3,'[\"AI\"]','[\"{p}\"]','answered',1,'{rep['started']}','{rep['completed']}','{p}','{d}',0.45,0.8,{t:.4f},0,0);"
        )
        SQL.append(f"SET @aq_{label}_{seq}=LAST_INSERT_ID();")
        evidence = '{"evidence":"answered"}'
        SQL.append(
            "INSERT INTO assessment_answers(assessment_question_id,answer_content,answer_count,result_status,score,scoring_reason,scoring_evidence,confidence,submitted_at,scored_at,clarity) "
            f"VALUES(@aq_{label}_{seq},{esc('本题作答内容：' + content[:40])},1,'scored',{round(t * 100, 2)},{esc(reason)},'{evidence}',0.6800,'{rep['completed']}','{rep['completed']}','clear');"
        )

    # dimension_scores 6 条
    for d in DIMS:
        sc = dim_avg([(p, dd, t) for p, dd, w, t, *_ in tests], d)
        qc = sum(1 for (p, dd, w, t, *_) in tests if dd == d)
        SQL.append(
            f"INSERT INTO assessment_dimension_scores(assessment_id,class_id,student_user_id,dimension,score,question_count,created_at,comment) VALUES(@aid_{label},{CLS},{UID},'{d}',{sc},{qc},'{rep['started']}',{esc('该维度综合表现评述')});"
        )

    # point_scores 16 点
    for p, d, w in POINTS:
        sc = round(tested[p][2] * 100, 2) if p in tested else 0.00
        qc = 1 if p in tested else 0
        verdict = 'mastered' if sc >= 60 else ('learning' if sc > 0 else None)
        SQL.append(
            f"INSERT INTO assessment_point_scores(assessment_id,class_id,student_user_id,dimension,assessment_point,score,question_count,created_at,comment,verdict) VALUES(@aid_{label},{CLS},{UID},'{d}','{p}',{sc},{qc},'{rep['started']}',{esc('考察点评述')},{esc(verdict)});"
        )

SQL.append("COMMIT;")
sql_text = "\n".join(SQL)

# 上传并执行
HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
sftp = c.open_sftp()
with sftp.open('/tmp/inject_reports.sql', 'w') as f:
    f.write(sql_text.encode('utf-8'))
sftp.close()
_, out, err = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment < /tmp/inject_reports.sql", timeout=180)
print('执行输出:', out.read().decode('utf-8', 'replace').strip()[:500])
print('执行错误:', err.read().decode('utf-8', 'replace').strip()[:1000])

# 验证
_, o, _ = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -N -e \"SELECT id,class_id,status,total_score,ability_level,question_count,completed_at FROM assessments WHERE student_user_id=9 AND class_id=37 ORDER BY id DESC LIMIT 6\"", timeout=60)
print('== 呕在组织1的测评 ==')
print(o.read().decode('utf-8', 'replace').strip())
c.close()
print('DONE')
