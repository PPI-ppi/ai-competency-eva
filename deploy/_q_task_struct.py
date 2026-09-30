# -*- coding: utf-8 -*-
"""探查：任务报告伪造前置——assessment_tasks 结构、组织1教师、教师端taskResults、assessments任务字段"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
out, err = q("SHOW CREATE TABLE assessment_tasks\\G")
print('== assessment_tasks 结构 =='); print((out or err)[:1800])
out, err = q("SELECT id,class_id,teacher_user_id,title,description,status,deadline_at FROM assessment_tasks LIMIT 8")
print('== 现有任务 =='); print(out or err)
out, err = q("SELECT id,name,teacher_user_id FROM classes WHERE id=37")
print('== 组织1教师 =='); print(out or err)
out, err = q("SHOW CREATE TABLE assessments\\G")
print('== assessments 任务相关列 =='); print((out or err)[:2600])
c.close()
