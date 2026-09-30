# -*- coding: utf-8 -*-
"""查后端最近 500 异常日志"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
cmds = [
    "journalctl -u ai-assessment-backend --since '30 minutes ago' --no-pager | grep -nE 'ERROR|Exception|500' | tail -40",
]
for cmd in cmds:
    _, o, e = c.exec_command(cmd, timeout=120)
    out = o.read().decode('utf-8', 'replace').strip()
    print(out or '(无匹配)')
c.close()
