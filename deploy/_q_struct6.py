# -*- coding: utf-8 -*-
"""探查7：232 states + abilityLevel 后端逻辑"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
out, err = q("SELECT id,assessment_id,class_id,dimension,assessment_point,theta,confidence,answer_count,question_count,follow_up_count,status,last_difficulty FROM assessment_point_states WHERE assessment_id=232")
print('== 232 states =='); print(out or err)
out, err = q("SELECT id,assessment_id,class_id,student_user_id,status,total_score,average_score,ability_level,completed_at,started_at,created_at FROM assessments WHERE id IN (219,231,232)")
print('== 219/231/232 =='); print(out or err)
out, err = q("SELECT assessment_id,class_id,student_user_id,dimension,assessment_point,score,question_count,verdict FROM assessment_point_scores WHERE assessment_id IN (219,231,232) ORDER BY assessment_id")
print('== 219/231/232 point_scores =='); print(out or err)
c.close()
