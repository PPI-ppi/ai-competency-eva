# -*- coding: utf-8 -*-
"""查教师账号与密码列名"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
_, o, _ = c.exec_command("mysql -uroot ai_assessment -N -e \"SHOW COLUMNS FROM users\"", timeout=60)
print('users 列:', o.read().decode('utf-8', 'replace').strip())
c.close()
