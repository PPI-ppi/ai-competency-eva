# -*- coding: utf-8 -*-
"""一键部署：前端 dist + 后端 app.jar，重启后端，验证"""
import os, sys, io, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
FE_DIST = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist'
REMOTE = '/opt/ai-assessment/frontend/ripple-ai-assessment/'
JAR = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar'
JS = 'index-BPrAKnkI.js'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
def run(cmd, t=180):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
stamp = time.strftime('%Y%m%d-%H%M%S')

# 前端
out, err = run(f"cp {REMOTE}index.html {REMOTE}index.html.bak-{stamp}")
print('前端备份:', err or f'index.html.bak-{stamp}')
sftp = c.open_sftp()
sftp.put(os.path.join(FE_DIST, 'assets', JS), REMOTE + 'assets/' + JS)
sftp.put(os.path.join(FE_DIST, 'assets', 'index-DARwNPEN.css'), REMOTE + 'assets/index-DARwNPEN.css')
sftp.put(os.path.join(FE_DIST, 'index.html'), REMOTE + 'index.html')
sftp.close()
out, err = run(f"grep -o 'index-[A-Za-z0-9_-]*\\.js' {REMOTE}index.html | sort -u")
print('前端引用:', out)

# 后端
out, err = run(f"cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-task-{stamp}")
print('后端备份:', err or f'app.jar.bak-task-{stamp}')
sftp = c.open_sftp()
sftp.put(JAR, '/opt/ai-assessment/backend/app.jar.new')
sftp.close()
out, err = run("mv /opt/ai-assessment/backend/app.jar.new /opt/ai-assessment/backend/app.jar && systemctl restart ai-assessment-backend && sleep 10 && systemctl is-active ai-assessment-backend", 180)
print('后端重启:', err or out)
out, err = run("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1")
print('公网首页 JS:', out)
c.close()
