# -*- coding: utf-8 -*-
"""生产部署：备份 → 上传新 jar → 迁移 → 重启 → 自检（不动前端）"""
import os, sys, io, paramiko, time

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
PASSWORD = os.environ.get('SSHPASS', '')
HOST, USER = '120.26.93.206', 'root'
LOCAL_JAR = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\target\ai-assessment-backend-0.1.0-SNAPSHOT.jar"
LOCAL_SQL = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\migrate_20260930.sql"
REMOTE_JAR = '/opt/ai-assessment/backend/app.jar'
REMOTE_SQL = '/tmp/migrate_20260930.sql'

MIGRATE_CMD = r'''
set -e
source /opt/ai-assessment/backend.env
echo "== db user: $DB_USERNAME =="
mysql -h127.0.0.1 -u"$DB_USERNAME" -p"$DB_PASSWORD" ai_assessment < /tmp/migrate_20260930.sql 2>&1
echo "== migrate exit: $? =="
mysql -h127.0.0.1 -u"$DB_USERNAME" -p"$DB_PASSWORD" ai_assessment -N -e "
SELECT CONCAT('question_kind_col=', COUNT(*)) FROM information_schema.columns WHERE table_schema='ai_assessment' AND table_name='questions' AND column_name='question_kind';
SELECT CONCAT('source_question_id_col=', COUNT(*)) FROM information_schema.columns WHERE table_schema='ai_assessment' AND table_name='questions' AND column_name='source_question_id';
SELECT CONCAT('rows_total=', COUNT(*)) FROM questions;
SELECT CONCAT('kind_test=', COUNT(*)) FROM questions WHERE question_kind='test';
SELECT CONCAT('kind_training=', COUNT(*)) FROM questions WHERE question_kind='training';" 2>&1
'''

def run(cli, cmd, timeout=180):
    _, out, err = cli.exec_command(cmd, timeout=timeout)
    o = out.read().decode('utf-8', 'replace')
    e = err.read().decode('utf-8', 'replace')
    return o, e

def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, 22, USER, PASSWORD, timeout=20, banner_timeout=30, auth_timeout=30)
    sftp = cli.open_sftp()

    print("== 1/5 备份当前 jar ==")
    o, e = run(cli, "cp /opt/ai-assessment/backend/app.jar /opt/ai-assessment/backend/app.jar.bak-20260930-fix && sha256sum /opt/ai-assessment/backend/app.jar.bak-20260930-fix")
    print(o, e)

    print("== 2/5 上传新 jar ==")
    sftp.put(LOCAL_JAR, REMOTE_JAR)
    o, e = run(cli, "sha256sum /opt/ai-assessment/backend/app.jar; stat -c '%y %s' /opt/ai-assessment/backend/app.jar")
    print(o, e)

    print("== 3/5 上传迁移 SQL 并执行 ==")
    sftp.put(LOCAL_SQL, REMOTE_SQL)
    o, e = run(cli, MIGRATE_CMD, timeout=120)
    print(o, e)

    print("== 4/5 重启后端 ==")
    o, e = run(cli, "systemctl restart ai-assessment-backend && echo RESTARTED", timeout=60)
    print(o, e)

    print("== 5/5 等待就绪并自检 ==")
    ready = False
    for i in range(20):
        time.sleep(3)
        o, _ = run(cli, "ss -tln | grep -c ':8081' || true")
        if o.strip() == '1':
            ready = True
            break
    print("port8081_ready =", ready)
    time.sleep(3)
    o, _ = run(cli, "curl -s -o /dev/null -w 'taxonomy=%{http_code}' --max-time 10 http://127.0.0.1:8081/api/questions/taxonomy || true")
    print(o)
    o, _ = run(cli, "tail -25 /opt/ai-assessment/backend/logs/*.log 2>/dev/null || journalctl -u ai-assessment-backend -n 25 --no-pager 2>&1 | tail -25 || tail -25 /opt/ai-assessment/app.log")
    print("--- log tail ---")
    print(o)
    sftp.close()
    cli.close()

if __name__ == '__main__':
    main()
