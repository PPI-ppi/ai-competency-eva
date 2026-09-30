# -*- coding: utf-8 -*-
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
for cmd in [
    "grep -i artifact /opt/ai-assessment/backend.env 2>/dev/null",
    "ls -la /data/artifacts/221/ 2>/dev/null",
    "grep -n 'location' /etc/nginx/conf.d/*.conf /etc/nginx/nginx.conf 2>/dev/null | head -30",
]:
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode('utf-8', 'replace').strip()
    print('CMD:', cmd)
    print(out or e.read().decode('utf-8', 'replace').strip())
    print('---')
c.close()
