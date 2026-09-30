# -*- coding: utf-8 -*-
"""部署：后端 plainChat jar + 前端对话窗口分离版 dist"""
import os, sys, io, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
DIST = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist"
TS = time.strftime('%Y%m%d-%H%M%S')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=180):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

# 1) 备份旧 jar 并上传新 jar
o, e = run('cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-plainchat-%s' % TS)
print('备份 jar:', o or e)
sftp = c.open_sftp()
sftp.put(JAR, '/opt/ai-assessment/backend/app.jar')
print('上传 jar:', os.path.getsize(JAR), 'bytes')

# 2) 备份前端 index.html 并上传 dist
o, e = run('cp /opt/ai-assessment/frontend/ripple-ai-assessment/index.html /opt/ai-assessment/frontend/ripple-ai-assessment/index.html.bak-plainchat-%s' % TS)
for rel in ['index.html', 'assets/index-BzoCFEd4.js', 'assets/index-BRuEaqxN.css']:
    sftp.put(os.path.join(DIST, rel.replace('/', os.sep)), f'/opt/ai-assessment/frontend/ripple-ai-assessment/{rel}')
    print('上传前端:', rel)
sftp.close()

# 3) 重启后端服务
o, e = run('systemctl restart ai-assessment-backend && sleep 25 && systemctl is-active ai-assessment-backend')
print('服务状态:', o or e)
o, e = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/classes/weight-support")
print('后端 8081 weight-support:', o)
o, e = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ripple-ai-assessment/")
print('前端首页:', o)
o, e = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/ripple-ai-assessment/assets/index-BzoCFEd4.js")
print('新 JS:', o)
c.close()
print('DONE')
