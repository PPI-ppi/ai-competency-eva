# -*- coding: utf-8 -*-
"""上传修复后 jar → 备份 → 替换 → 重启 → 自检"""
import os, sys, io, hashlib, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
LOCAL_JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
REMOTE = '/opt/ai-assessment/backend/app.jar'
BACKUP = '/opt/ai-assessment/backend/app.jar.bak-20260930-fix2'

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

print('本地 jar sha256:', sha(LOCAL_JAR))
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=120):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    o = out.read().decode('utf-8', 'replace')
    e = err.read().decode('utf-8', 'replace')
    return o.strip(), e.strip()

o, e = run(f'sha256sum {REMOTE} && systemctl is-active ai-assessment-backend')
print('远程当前:', o)
o, e = run(f'cp {REMOTE} {BACKUP} && sha256sum {BACKUP}')
print('备份:', o)

sftp = c.open_sftp()
sftp.put(LOCAL_JAR, '/tmp/app-fix2.jar')
sftp.close()
o, e = run('sha256sum /tmp/app-fix2.jar')
print('上传:', o)

o, e = run(f'cp /tmp/app-fix2.jar {REMOTE} && sha256sum {REMOTE}')
print('替换:', o)

o, e = run('systemctl restart ai-assessment-backend && sleep 6 && systemctl is-active ai-assessment-backend')
print('重启:', o or e)
o, e = run('ss -ltnp | grep 8081')
print('端口:', o or e)
o, e = run('tail -n 12 /opt/ai-assessment/backend.log 2>/dev/null || journalctl -u ai-assessment-backend -n 12 --no-pager')
print('日志:\n', o or e)
o, e = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/taxonomy')
print('taxonomy HTTP:', o)
c.close()
