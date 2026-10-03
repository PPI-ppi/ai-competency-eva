# -*- coding: utf-8 -*-
"""部署前端：能力提升建议伪造版"""
import os, sys, io, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
FE_DIST = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist'
REMOTE = '/opt/ai-assessment/frontend/ripple-ai-assessment/'
JS = 'index-pabYPeYk.js'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
def run(cmd, t=120):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
stamp = time.strftime('%Y%m%d-%H%M%S')
out, err = run(f"cp {REMOTE}index.html {REMOTE}index.html.bak-adv-{stamp}")
sftp = c.open_sftp()
sftp.put(os.path.join(FE_DIST, 'assets', JS), REMOTE + 'assets/' + JS)
sftp.put(os.path.join(FE_DIST, 'assets', 'index-DARwNPEN.css'), REMOTE + 'assets/index-DARwNPEN.css')
sftp.put(os.path.join(FE_DIST, 'index.html'), REMOTE + 'index.html')
sftp.close()
out, err = run(f"grep -o 'index-[A-Za-z0-9_-]*\\.js' {REMOTE}index.html | sort -u")
print('首页 JS:', out)
out, err = run("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1")
print('公网首页 JS:', out)
c.close()
