# -*- coding: utf-8 -*-
"""精确修正 dimension_scores 百分制（绕过 0-1 中间精度丢失）"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql --default-character-set=utf8mb4 -uroot {db} -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
FIX = {
    234: {'AI基础认知': 45.00, 'AI伦理与合规': 43.68},
    235: {'AI基础认知': 68.00, '提示词工程': 67.00, 'AI结果评估与优化': 56.85, '人机协同解决问题': 65.00},
    236: {'AI基础认知': 86.00, '提示词工程': 85.00, 'AI结果评估与优化': 84.00, '人机协同解决问题': 87.00, 'AI伦理与合规': 77.84},
}
for aid, dims in FIX.items():
    for dim, score in dims.items():
        out, err = q(f"UPDATE assessment_dimension_scores SET score={score} WHERE assessment_id={aid} AND dimension='{dim}'")
        if err: print(aid, dim, err)
out, err = q("SELECT assessment_id,dimension,score FROM assessment_dimension_scores WHERE assessment_id IN (234,235,236) ORDER BY assessment_id,id")
print(out or err)
c.close()
