# -*- coding: utf-8 -*-
"""探查8：class37 权重 + 219 states 全集 + 题库题目样例"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SELECT id,name,point_weights FROM classes WHERE id=37")
print('== class37 =='); print(out or err)
out, err = q("SELECT assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,status FROM assessment_point_states WHERE assessment_id=219 ORDER BY id")
print('== 219 states =='); print(out or err)
out, err = q("SELECT id,type,LEFT(content,60),assessment_points,dimension_name FROM questions WHERE type IN ('DIALOGUE','PRACTICAL','SINGLE_CHOICE') LIMIT 12")
print('== 题库题目 =='); print(out or err)
out, err = q("SELECT assessment_id,class_id,student_user_id,status,total_score,ability_level,started_at,completed_at,created_at FROM assessments WHERE id=219")
print('== 219 =='); print(out or err)
c.close()
