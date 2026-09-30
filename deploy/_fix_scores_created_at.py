# -*- coding: utf-8 -*-
"""修正 dimension_scores/point_scores 的 created_at 早于本场 started_at（保证 beforeDimensions 链路）"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
for aid, started in ((234, '2026-09-14 09:20:00'), (235, '2026-09-21 14:00:00'), (236, '2026-09-30 21:10:00')):
    before = started[:10] + ' ' + (f'{int(started[11:13]) - 1:02d}:00:00' if int(started[11:13]) > 0 else '00:00:00')
    out, err = q(f"UPDATE assessment_dimension_scores SET created_at='{before}' WHERE assessment_id={aid}")
    out2, err2 = q(f"UPDATE assessment_point_scores SET created_at='{before}' WHERE assessment_id={aid}")
    print(aid, 'dims:', err or 'ok', '| points:', err2 or 'ok')
# 校验 236 的 beforeDimensions 应取到 235 的维度分
out, err = q("SELECT assessment_id,dimension,score,created_at FROM assessment_dimension_scores WHERE assessment_id IN (234,235,236) ORDER BY assessment_id,id")
print(out or err)
c.close()
