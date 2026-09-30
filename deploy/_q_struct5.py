# -*- coding: utf-8 -*-
"""探查6：assessment_point_states 结构 + 232 的 states 样例 + 考察点体系"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SHOW CREATE TABLE assessment_point_states\\G")
print('== states 结构 =='); print((out or err)[:2500]); print()
out, err = q("SELECT id,assessment_id,class_id,student_user_id,dimension,assessment_point,theta,confidence,status,answer_count,question_count FROM assessment_point_states WHERE assessment_id=232")
print('== 232 states =='); print(out or err)
out, err = q("SELECT assessment_point,dimension FROM assessment_point_states GROUP BY assessment_point,dimension ORDER BY dimension LIMIT 40")
print('== 全部考察点 =='); print(out or err)
c.close()
