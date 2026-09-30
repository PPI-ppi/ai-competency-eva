# -*- coding: utf-8 -*-
"""部署 frontend-v9 构建产物到服务器 ripple-ai-assessment/（先备份）"""
import os, sys, io, paramiko, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')
DIST = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\dist"
FE_DIR = '/opt/ai-assessment/frontend/ripple-ai-assessment'
TS = time.strftime('%Y%m%d-%H%M%S')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(cmd, timeout=120):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

# 1) 备份整目录
o, e = run(f'cp -r {FE_DIR} {FE_DIR}.bak-src-{TS} && ls -d {FE_DIR}.bak-src-{TS}')
print('备份:', o or e)

# 2) 上传 dist 产物
sftp = c.open_sftp()
for rel in ['index.html', 'assets/index-pGvfEsyP.js', 'assets/index-BRuEaqxN.css']:
    local = os.path.join(DIST, rel.replace('/', os.sep))
    sftp.put(local, f'{FE_DIR}/{rel}')
    print('上传:', rel)
sftp.close()

# 3) 确认线上文件
o, e = run(f'ls -la {FE_DIR}/index.html {FE_DIR}/assets/index-pGvfEsyP.js {FE_DIR}/assets/index-BRuEaqxN.css')
print(o or e)

# 4) 首页引用
o, e = run(f'curl -s http://127.0.0.1/ripple-ai-assessment/ | grep -o "assets/index-[A-Za-z0-9_-]*\\.[a-z]*"')
print('首页引用:', o)
c.close()
print('DONE')
