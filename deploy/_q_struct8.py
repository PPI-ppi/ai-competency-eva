# -*- coding: utf-8 -*-
"""探查9：questions 表结构 + 各类题目样例"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()
out, err = q("SHOW CREATE TABLE questions\\G")
print('== questions 结构 =='); print((out or err)[:2000]); print()
out, err = q("SELECT id,type,LEFT(content,80),LEFT(options,50),assessment_points FROM questions WHERE type='SINGLE_CHOICE' LIMIT 4")
print('== 单选 =='); print(out or err)
out, err = q("SELECT id,type,LEFT(content,80),LEFT(options,50),assessment_points FROM questions WHERE type='DIALOGUE' LIMIT 4")
print('== 对话 =='); print(out or err)
out, err = q("SELECT id,type,LEFT(content,80),LEFT(options,50),assessment_points FROM questions WHERE type='PRACTICAL' LIMIT 4")
print('== 实操 =='); print(out or err)
c.close()
