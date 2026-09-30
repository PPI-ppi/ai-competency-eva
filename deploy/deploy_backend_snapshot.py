# -*- coding: utf-8 -*-
"""部署后端：备份 → 上传 app.jar → 重启 systemd → 健康检查"""
import os, sys, io, time, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER, PWD = '120.26.93.206', 'root', os.environ.get('SSHPASS')
JAR = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar'
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)
def run(cmd, t=300):
    _, o, e = c.exec_command(cmd, timeout=t)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

stamp = time.strftime('%Y%m%d-%H%M%S')
out, err = run(f"cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-snapshot-{stamp}")
print('备份:', err or f'app.jar.bak-snapshot-{stamp}')
sftp = c.open_sftp()
sftp.put(JAR, '/opt/ai-assessment/backend/app.jar.new')
sftp.close()
print('上传完成, 大小:', os.path.getsize(JAR))
out, err = run("mv /opt/ai-assessment/backend/app.jar.new /opt/ai-assessment/backend/app.jar && systemctl restart ai-assessment-backend && sleep 8 && systemctl is-active ai-assessment-backend", 120)
print('重启:', err or out)
out, err = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/api/reports -H 'Authorization: x' ; echo")
print('后端健康(401预期):', out, err)
c.close()
