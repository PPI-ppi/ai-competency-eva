# -*- coding: utf-8 -*-
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
for sql in [
    "SELECT id, status, total_score, ability_level FROM assessments WHERE id IN (210,211,212)",
    "SELECT COUNT(*) FROM assessment_dimension_scores WHERE assessment_id IN (210,211,212)",
    "SELECT COUNT(*) FROM assessment_point_scores WHERE assessment_id IN (210,211,212)",
]:
    _, o, e = c.exec_command("mysql -uroot ai_assessment -N -e \"" + sql + "\"", timeout=60)
    print(sql, '=>', o.read().decode('utf-8', 'replace').strip() or e.read().decode('utf-8', 'replace').strip())
c.close()
