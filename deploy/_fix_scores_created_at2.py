# -*- coding: utf-8 -*-
"""修正 dimension/point scores 的 created_at = 本场 completed_at（真实落库行为）"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
for aid, completed in ((234, '2026-09-14 09:48:00'), (235, '2026-09-21 14:32:00'), (236, '2026-09-30 21:42:00')):
    out, err = q(f"UPDATE assessment_dimension_scores SET created_at='{completed}' WHERE assessment_id={aid}")
    out2, err2 = q(f"UPDATE assessment_point_scores SET created_at='{completed}' WHERE assessment_id={aid}")
    print(aid, err or 'dims ok', err2 or 'points ok')
c.close()
