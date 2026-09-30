# -*- coding: utf-8 -*-
"""探查3：呕账号 + 组织1成员 + assessments 结构 + 真实报告模板"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SELECT id,username,name,nickname FROM users WHERE username='呕' OR name='呕' OR nickname='呕' LIMIT 5")
print('== 呕 users =='); print(out or err)
out, err = q("SELECT id,class_id,student_user_id,status FROM class_members WHERE class_id=37 LIMIT 30")
print('== 组织1成员 =='); print(out or err)

out, err = q("SHOW CREATE TABLE assessments\\G")
print('== assessments 结构 =='); print((out or err)[:3500])
c.close()
