# -*- coding: utf-8 -*-
"""探查：Assessment.taskTitle 来源 + 教师账号 + entity 字段"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
out, err = q("SELECT id,username,name,nickname,role FROM users WHERE id=48")
print('== 组织1教师账号 =='); print(out or err)
out, err = q("SELECT id,task_id,status,total_score,completed_at FROM assessments WHERE task_id IS NOT NULL LIMIT 6")
print('== 现有任务测评 =='); print(out or err)
c.close()
