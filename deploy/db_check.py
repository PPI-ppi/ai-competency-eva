# -*- coding: utf-8 -*-
"""生产库排查：assessment_point_states 是否初始化、任务 assessment_points 内容"""
import os, sys, io, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST, USER = '120.26.93.206', 'root'
PWD = os.environ.get('SSHPASS')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username=USER, password=PWD, timeout=30)

def run(sql, label):
    cmd = f"mysql -h127.0.0.1 -uai_assessment -p$(grep -oP '(?<=DB_PASSWORD=).*' /opt/ai-assessment/backend.env) ai_assessment -e \"{sql}\" 2>&1"
    _, out, err = c.exec_command(cmd, timeout=60)
    o = out.read().decode('utf-8', 'replace')
    e = err.read().decode('utf-8', 'replace')
    print(f'=== {label} ===')
    print(o if o.strip() else '(empty)')
    if e.strip():
        print('stderr:', e[:500])

run("SELECT id, assessment_id, assessment_point, status, theta, confidence FROM assessment_point_states WHERE assessment_id IN (193,194);",
    'assessment_point_states (193/194)')
run("SHOW CREATE TABLE assessment_point_states;", '建表语句')
run("SELECT id, task_id, student_user_id, class_id, status, question_count, assessment_points, dimensions FROM assessments WHERE id IN (193,194);",
    'assessments 193/194')
run("SELECT id, class_id, title, assessment_points, dimensions, question_count FROM assessment_tasks WHERE id=(SELECT task_id FROM assessments WHERE id=194);",
    'task of 194')

c.close()
