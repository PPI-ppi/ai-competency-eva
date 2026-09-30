# -*- coding: utf-8 -*-
"""nginx 增加 /artifacts/ 静态映射 → /data/artifacts/"""
import os, sys, io, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)

def run(cmd, timeout=60):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

CONF = '/etc/nginx/sites-enabled/default'
sftp = c.open_sftp()
s = io.open = None
with sftp.open(CONF, 'r') as f:
    content = f.read().decode('utf-8')
print('已读配置, 长度:', len(content))
anchor = '    location ^~ /assets/ {'
assert anchor in content, '未找到 assets location'
if 'artifacts' not in content:
    block = '    location ^~ /artifacts/ {\n        alias /data/artifacts/;\n    }\n\n'
    content = content.replace(anchor, block + anchor, 1)
    with sftp.open(CONF, 'w') as f:
        f.write(content.encode('utf-8'))
    print('已插入 artifacts location')
else:
    print('已存在 artifacts 配置')
sftp.close()
o, e = run('nginx -t 2>&1')
print('nginx -t:', o or e)
o, e = run('systemctl reload nginx && echo OK')
print('reload:', o or e)
c.close()
print('DONE')
