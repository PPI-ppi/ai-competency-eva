# -*- coding: utf-8 -*-
"""部署：客观题自动提交前端"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
sftp = c.open_sftp()
sftp.put(r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist\index.html', '/opt/ai-assessment/frontend/ripple-ai-assessment/index.html')
sftp.put(r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist\assets\index-DepPLYpz.js', '/opt/ai-assessment/frontend/ripple-ai-assessment/assets/index-DepPLYpz.js')
sftp.close()
_, o, _ = c.exec_command("curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o 'index-[A-Za-z0-9_-]*\\.js' | head -1", timeout=60)
print('首页JS:', o.read().decode('utf-8', 'replace').strip())
c.close()
print('DONE')
