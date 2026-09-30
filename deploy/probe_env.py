# -*- coding: utf-8 -*-
"""读取 backend.env（脱敏）+ app.log 尾部 + 对比本地 jar"""
import os, sys, io, hashlib, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
PASSWORD = os.environ.get('SSHPASS', '')
HOST, USER = '120.26.93.206', 'root'

def mask_line(line):
    """只显示 key 名 + 值长度/前 4 位，不泄露密码"""
    line = line.strip()
    if not line or line.startswith('#') or '=' not in line:
        return line
    k, v = line.split('=', 1)
    if any(s in k.upper() for s in ('PASSWORD', 'TOKEN', 'KEY', 'SECRET', 'URL')):
        if 'URL' in k.upper():
            return f"{k}=<url, len={len(v)}>"
        return f"{k}=<masked, len={len(v)}, head={v[:4]}...>"
    return f"{k}={v}"

def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PASSWORD, timeout=20, banner_timeout=30, auth_timeout=30)

    for name, cmd in [
        ("backend.env (masked)", r"cat /opt/ai-assessment/backend.env 2>&1"),
        ("backend.env.save (masked)", r"cat /opt/ai-assessment/backend.env.save 2>&1"),
        ("app.log tail", r"tail -60 /opt/ai-assessment/app.log 2>&1"),
        ("jar times", r"stat -c '%y %s %n' /opt/ai-assessment/backend/app.jar /opt/ai-assessment/app.jar 2>&1"),
        ("remote jar sha", r"sha256sum /opt/ai-assessment/backend/app.jar /opt/ai-assessment/app.jar 2>&1"),
    ]:
        print(f"\n########## {name} ##########")
        _, out, err = cli.exec_command(cmd, timeout=60)
        text = out.read().decode('utf-8', 'replace')
        if name.startswith('backend.env'):
            print("\n".join(mask_line(l) for l in text.splitlines()))
        else:
            print(text)
        e = err.read().decode('utf-8', 'replace')
        if e.strip():
            print("--- stderr ---"); print(e)
    cli.close()

    print("\n########## local new jar sha ##########")
    local = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
    with open(local, 'rb') as f:
        h = hashlib.sha256(f.read()).hexdigest()
    print(h, local)

if __name__ == '__main__':
    main()
