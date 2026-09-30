# -*- coding: utf-8 -*-
"""部署前端 dist：备份 → 上传 assets → 校验 index.html 引用"""
import os, sys, io, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
DIST = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist'
REMOTE = '/opt/ai-assessment/frontend/ripple-ai-assessment/'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
def run(cmd, t=120):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

stamp = time.strftime('%Y%m%d-%H%M%S')
out, err = run(f"mkdir -p {REMOTE}assets && cp {REMOTE}index.html {REMOTE}index.html.bak-{stamp}")
print('备份 index:', err or f'index.html.bak-{stamp}')
sftp = c.open_sftp()
# 上传新 js/css
for f in ('index-CEErCIcJ.js', 'index-DARwNPEN.css'):
    local = os.path.join(DIST, 'assets', f)
    if os.path.exists(local):
        sftp.put(local, REMOTE + 'assets/' + f)
        print('上传', f, os.path.getsize(local))
# index.html
sftp.put(os.path.join(DIST, 'index.html'), REMOTE + 'index.html')
sftp.close()
out, err = run(f"grep -o 'index-[A-Za-z0-9_-]*\\.\\(js\\|css\\)' {REMOTE}index.html | sort -u")
print('index.html 引用:', out)
out, err = run("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1")
print('公网首页 JS:', out)
c.close()
