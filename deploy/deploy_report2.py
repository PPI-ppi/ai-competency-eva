# -*- coding: utf-8 -*-
"""部署：报告增强 jar（含 status 修正）"""
import os, sys, io, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
TS = time.strftime('%Y%m%d-%H%M%S')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=180):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

run('cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-report2-%s' % TS)
sftp = c.open_sftp()
sftp.put(JAR, '/opt/ai-assessment/backend/app.jar')
sftp.close()
print('jar 上传', os.path.getsize(JAR))
o, e = run('systemctl restart ai-assessment-backend && sleep 25 && systemctl is-active ai-assessment-backend')
print('服务:', o or e)
o, e = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/ripple-ai-assessment/')
print('首页 HTTP:', o)
c.close()
print('DONE')
