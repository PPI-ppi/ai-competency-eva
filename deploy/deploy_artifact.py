# -*- coding: utf-8 -*-
"""部署：实操题附件功能（jar + 前端）"""
import os, sys, io, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
DIST = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist"
REMOTE = '/opt/ai-assessment/frontend/ripple-ai-assessment/'
TS = time.strftime('%Y%m%d-%H%M%S')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=180):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

run('cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-artifact-%s' % TS)
run('cp -r %s %s.bak-artifact-%s' % (REMOTE, REMOTE.rstrip('/'), TS))
sftp = c.open_sftp()
sftp.put(JAR, '/opt/ai-assessment/backend/app.jar')
print('jar 上传', os.path.getsize(JAR))
for f in os.listdir(DIST):
    lp = os.path.join(DIST, f)
    if os.path.isfile(lp):
        sftp.put(lp, REMOTE + f)
        print('上传:', f)
    elif f == 'assets' and os.path.isdir(lp):
        for a in os.listdir(lp):
            sftp.put(os.path.join(lp, a), REMOTE + 'assets/' + a)
            print('上传: assets/' + a)
sftp.close()
o, e = run('systemctl restart ai-assessment-backend && sleep 25 && systemctl is-active ai-assessment-backend')
print('服务:', o or e)
o, _ = run("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1")
print('首页JS:', o)
c.close()
print('DONE')
