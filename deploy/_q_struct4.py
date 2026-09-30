# -*- coding: utf-8 -*-
"""探查4：真实报告数据模板 + 相关表结构"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SELECT id,class_id,status,total_score,average_score,ability_level,question_count,completed_at FROM assessments WHERE student_user_id=9 ORDER BY id DESC LIMIT 10")
print('== 呕现有测评 =='); print(out or err)

out, err = q("SELECT id,class_id,student_user_id,status,total_score,average_score,ability_level,question_count,completed_at FROM assessments WHERE status='completed' ORDER BY id DESC LIMIT 5")
print('== 最近完成的测评(任意用户) =='); print(out or err)

for t in ['assessment_dimension_scores','assessment_point_scores','assessment_answers','assessment_questions']:
    out, err = q(f"SHOW CREATE TABLE {t}\\G")
    print(f'== {t} 结构 =='); print((out or err)[:2200]); print()
c.close()
