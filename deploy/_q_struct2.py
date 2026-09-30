# -*- coding: utf-8 -*-
"""探查2：users/students 结构 + 呕账号 + assessments 结构"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

for t in ['users', 'students', 'class_members']:
    out, err = q(f"SHOW CREATE TABLE {t}\\G")
    print(f'== {t} 结构 =='); print((out or err)[:1500]); print()

out, err = q("SELECT id,username,password,nickname,name FROM users WHERE username='呕' OR nickname='呕' OR name='呕' LIMIT 5")
print('== 呕 in users =='); print(out or err)
out, err = q("SELECT id,user_id,student_no,real_name,nickname FROM students WHERE real_name='呕' OR nickname='呕' OR user_id IN (SELECT id FROM users WHERE username='呕') LIMIT 5")
print('== 呕 in students =='); print(out or err)
out, err = q("SELECT user_id,class_id,joined_at FROM class_members WHERE class_id=37 LIMIT 20")
print('== 组织1成员 =='); print(out or err)
c.close()
