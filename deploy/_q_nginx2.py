# -*- coding: utf-8 -*-
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
for cmd in [
    "nginx -T 2>/dev/null | grep -nE 'server_name|root|location|proxy_pass|alias' | head -60",
    "ls /etc/nginx/conf.d/ /etc/nginx/sites-enabled/ 2>/dev/null",
]:
    _, o, e = c.exec_command(cmd, timeout=60)
    out = o.read().decode('utf-8', 'replace').strip()
    print('CMD:', cmd)
    print(out[:3000] or e.read().decode('utf-8', 'replace').strip())
    print('---')
c.close()
