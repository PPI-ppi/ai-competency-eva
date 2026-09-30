# -*- coding: utf-8 -*-
"""修正 dimension_scores 为百分制 + 查真实 assessments.dimensions 格式"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
out, err = q("SELECT id,LEFT(dimensions,300),LEFT(assessment_points,150) FROM assessments WHERE id IN (219,232)")
print('== 真实 dimensions 格式 =='); print(out or err)
out, err = q("UPDATE assessment_dimension_scores SET score=ROUND(score*100,2) WHERE assessment_id IN (234,235,236)")
print('update dims:', err or 'ok')
out, err = q("SELECT assessment_id,dimension,score FROM assessment_dimension_scores WHERE assessment_id IN (234,235,236) ORDER BY assessment_id,id")
print(out or err)
# 236 的 beforeDimensions 应为 235 的维度分
out, err = q("SELECT score FROM assessment_dimension_scores WHERE assessment_id=235 AND dimension='提示词工程'")
print('235 提示词工程分:', out or err)
c.close()
