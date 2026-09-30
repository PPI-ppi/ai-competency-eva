# -*- coding: utf-8 -*-
"""等待并自检 8081 / taxonomy / 启动日志"""
import os, sys, io, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=60):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

for i in range(12):
    o, e = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/taxonomy')
    print(f'wait {i*5}s -> taxonomy HTTP: {o}')
    if o == '401':
        break
    time.sleep(5)

o, e = run('systemctl is-active ai-assessment-backend; tail -n 6 /opt/ai-assessment/backend.log 2>/dev/null; grep -c "Started AssessmentApplication" /opt/ai-assessment/backend.log 2>/dev/null')
print(o)
c.close()
