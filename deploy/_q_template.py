# -*- coding: utf-8 -*-
"""探查5：真实报告内容模板（assessment 232）"""
import os, sys, io, paramiko, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SELECT id,dimensions,assessment_points,point_weights,advice,report_json FROM assessments WHERE id=232")
print('== 232 全文模板 ==')
print((out or err)[:8000])
print()
out, err = q("SELECT dimension,score,question_count,comment FROM assessment_dimension_scores WHERE assessment_id=232")
print('== 232 维度分 =='); print(out or err)
out, err = q("SELECT dimension,assessment_point,score,question_count,verdict,comment FROM assessment_point_scores WHERE assessment_id=232")
print('== 232 考察点分 =='); print(out or err)
out, err = q("SELECT id,question_id,sequence_no,type,point_name,dimension_name,status,finished FROM assessment_questions WHERE assessment_id=232")
print('== 232 题目 =='); print(out or err)
out, err = q("SELECT aq.id,aq.question_id,an.answer_content,an.result_status,an.score,an.scoring_reason FROM assessment_questions aq LEFT JOIN assessment_answers an ON an.assessment_question_id=aq.id WHERE aq.assessment_id=232")
print('== 232 答案 =='); print((out or err)[:3000])
c.close()
