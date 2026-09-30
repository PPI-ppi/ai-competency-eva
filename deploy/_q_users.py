# -*- coding: utf-8 -*-
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
sql = "SELECT id, username, nickname FROM users WHERE id IN (9,33)"
_, o, e = c.exec_command("mysql -uroot ai_assessment -N -e \"" + sql + "\"", timeout=60)
out = o.read().decode('utf-8', 'replace').strip()
err = e.read().decode('utf-8', 'replace').strip()
print(out or err)
c.close()
