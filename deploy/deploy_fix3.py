# -*- coding: utf-8 -*-
"""1) 部署后端 jar（备份→替换→重启→自检）
   2) 下载线上前端 index-*.js → 本地 patch assessmentPointWeights:!1 → !0 → 备份 → 上传"""
import os, sys, io, hashlib, time, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
LOCAL_JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
REMOTE_JAR = '/opt/ai-assessment/backend/app.jar'
LOCAL_FE = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ripple-ai-frontend-v9\_deployed.js"
FE_DIR = '/opt/ai-assessment/frontend/assets'

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=120):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

print('== 1. 后端 jar ==')
print('本地 sha:', sha(LOCAL_JAR))
o, e = run(f'sha256sum {REMOTE_JAR}')
print('远程当前:', o)
run(f'cp {REMOTE_JAR} {REMOTE_JAR}.bak-20260930-fix3')
sftp = c.open_sftp()
sftp.put(LOCAL_JAR, '/tmp/app-fix3.jar')
sftp.close()
run(f'cp /tmp/app-fix3.jar {REMOTE_JAR}')
o, e = run(f'sha256sum {REMOTE_JAR}')
print('替换后:', o)
run('systemctl restart ai-assessment-backend')
for i in range(12):
    o, e = run('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8081/api/taxonomy')
    if o == '401':
        print(f'后端就绪 (taxonomy {o}, {i*5}s)')
        break
    time.sleep(5)

print('\n== 2. 前端 JS patch ==')
o, e = run(f'ls {FE_DIR}/index-*.js')
fe_remote = o.splitlines()[0] if o else None
print('线上前端文件:', fe_remote)
if not fe_remote:
    print('!! 未找到线上 index-*.js'); raise SystemExit(1)
sftp = c.open_sftp()
sftp.get(fe_remote, LOCAL_FE)
sftp.close()
s = io.open(LOCAL_FE, encoding='utf-8').read()
key_old = 'assessmentPointWeights:!1'
key_new = 'assessmentPointWeights:!0'
cnt = s.count(key_old)
print('待替换次数:', cnt)
if cnt != 1:
    print('!! 替换次数非1，中止，不覆盖线上'); raise SystemExit(1)
s2 = s.replace(key_old, key_new, 1)
io.open(LOCAL_FE, 'w', encoding='utf-8', newline='').write(s2)
print('本地 patch 完成, 新长度', len(s2), '(原', len(s), ')')
run(f'cp {fe_remote} {fe_remote}.bak-20260930-fix3')
sftp = c.open_sftp()
sftp.put(LOCAL_FE, '/tmp/index-fix3.js')
sftp.close()
run(f'cp /tmp/index-fix3.js {fe_remote}')
o, e = run(f'sha256sum {fe_remote}')
print('线上前端已替换:', o)
c.close()
print('DONE')
