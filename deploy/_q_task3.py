# -*- coding: utf-8 -*-
"""教师账号 + Assessment entity taskTitle 来源"""
import os, sys, io, paramiko, glob
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
_, o, e = c.exec_command("mysql --default-character-set=utf8mb4 -uroot ai_assessment -e \"SELECT id,username,name,nickname FROM users WHERE id=48\"", timeout=60)
print('教师账号:', o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip())
c.close()
# 本地查 Assessment entity 的 taskTitle
hits = []
for p in glob.glob(r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\entity\Assessment.java'):
    import re
    s = io.open(p, encoding='utf-8').read()
    for m in re.finditer(r'.*[Tt]askTitle.*', s):
        hits.append(m.group(0).strip()[:120])
print('== Assessment entity taskTitle ==')
print('\n'.join(hits[:12]) or '无')
