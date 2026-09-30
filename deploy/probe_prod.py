# -*- coding: utf-8 -*-
"""AI 测评生产服务器 · 只读侦察（不改任何东西）"""
import os, sys, io, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
PASSWORD = os.environ.get('SSHPASS', '')
HOST = '120.26.93.206'
USER = 'root'

CMDS = [
    ("systemd-backend-unit", r"systemctl cat ai-assessment-backend 2>&1 | head -80"),
    ("systemd-agent-unit", r"systemctl cat ai-assessment-agent 2>&1 | head -50"),
    ("opt-tree", r"ls -la /opt/ai-assessment/ 2>&1; echo '--- backend ---'; ls -la /opt/ai-assessment/backend 2>&1; echo '--- frontend ---'; ls /opt/ai-assessment/frontend 2>&1 | head; echo '--- agent ---'; ls /opt/ai-assessment/agent 2>&1 | head"),
    ("jar-state", r"ls -la /opt/ai-assessment/backend/*.jar 2>&1; sha256sum /opt/ai-assessment/backend/*.jar 2>&1"),
    ("ports", r"ss -tlnp 2>&1 | grep -E ':(8080|8081|8088|80|443)\b' || true"),
    ("services", r"systemctl is-active ai-assessment-backend ai-assessment-agent 2>&1; echo '--- enabled ---'; systemctl is-enabled ai-assessment-backend ai-assessment-agent 2>&1"),
    ("env-file", r"if [ -f /opt/ai-assessment/.env ]; then sed -E 's/^([A-Za-z0-9_]*)(PASSWORD|TOKEN|KEY|SECRET)=.*/\1\2=***MASKED***/I' /opt/ai-assessment/.env; echo '--- /opt/ai-assessment/.env ends ---'; fi"),
    ("backend-env", r"systemctl show ai-assessment-backend -p Environment -p EnvironmentFile 2>&1 | sed -E 's/(PASSWORD|TOKEN|KEY|SECRET)=[^ ]*/\1=***MASKED***/gI'"),
    ("agent-env", r"systemctl show ai-assessment-agent -p Environment -p EnvironmentFile 2>&1 | sed -E 's/(PASSWORD|TOKEN|KEY|SECRET)=[^ ]*/\1=***MASKED***/gI'"),
    ("nginx", r"nginx -T 2>/dev/null | grep -nE 'server_name|root |proxy_pass|location |alias ' | head -80"),
    ("disk-mem", r"free -m | head -3; df -h / | tail -1"),
    ("db-reach", r"mysqladmin ping -h 127.0.0.1 -uroot 2>&1 | head -3 || true"),
]

def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PASSWORD, timeout=20, banner_timeout=30, auth_timeout=30)
    print(f"== connected {USER}@{HOST} ==")
    for name, cmd in CMDS:
        print(f"\n########## {name} ##########")
        stdin, stdout, stderr = cli.exec_command(cmd, timeout=60)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        print(out)
        if err.strip():
            print("--- stderr ---")
            print(err)
    cli.close()

if __name__ == '__main__':
    main()
