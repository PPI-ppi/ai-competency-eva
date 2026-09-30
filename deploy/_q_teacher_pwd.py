# -*- coding: utf-8 -*-
"""确认教师账号密码：查 users 表密码格式"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
_, o, e = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -e \"SELECT id,username,name,nickname,LEFT(password,40) AS pwd FROM users WHERE id=48\"", timeout=60)
print(o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip())
# 顺便确认 205 是什么（trend 里的 8.04）
_, o, _ = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -N -e \"SELECT id,task_id,class_id,total_score,status,completed_at FROM assessments WHERE id=205\"", timeout=60)
print('205:', o.read().decode('utf-8', 'replace').strip())
c.close()
