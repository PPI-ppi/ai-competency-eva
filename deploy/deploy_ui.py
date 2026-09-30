# -*- coding: utf-8 -*-
"""部署：UI 调整前端（测评页等高滚动 + 报告页分数横条）"""
import os, sys, io, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
DIST = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist"
REMOTE = '/opt/ai-assessment/frontend/ripple-ai-assessment/'
TS = time.strftime('%Y%m%d-%H%M%S')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=120):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

run('cp -r %s %s.bak-ui-%s' % (REMOTE, REMOTE.rstrip('/'), TS))
sftp = c.open_sftp()
def up(local, remote):
    sftp.put(local, remote)
    print('上传:', os.path.basename(local))
for f in os.listdir(DIST):
    lp = os.path.join(DIST, f)
    if os.path.isfile(lp):
        up(lp, REMOTE + f)
    elif f == 'assets' and os.path.isdir(lp):
        for a in os.listdir(lp):
            up(os.path.join(lp, a), REMOTE + 'assets/' + a)
sftp.close()
o, _ = run("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1")
print('首页 JS:', o)
c.close()
print('DONE')
