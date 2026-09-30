# -*- coding: utf-8 -*-
"""探查：呕账号 / 组织1 / 真实报告结构模板"""
import os, sys, io, paramiko
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)

def q(sql, db='ai_assessment'):
    _, o, e = c.exec_command(f"mysql -uroot {db} -N -e \"{sql}\"", timeout=120)
    return o.read().decode('utf-8', 'replace').strip(), e.read().decode('utf-8', 'replace').strip()

out, err = q("SELECT id,account,name,role,phone,created_at FROM users WHERE account IN ('呕') OR name IN ('呕') LIMIT 10")
print('== 呕账号 =='); print(out or err)

out, err = q("SELECT id,name,description,created_at FROM classes WHERE name LIKE '%组织1%' OR name='组织1' LIMIT 10")
print('== 组织1 =='); print(out or err)

out, err = q("SHOW TABLES")
print('== 表 =='); print(out or err)

out, err = q("SHOW CREATE TABLE assessment\\G")
print('== assessment 结构 =='); print((out or err)[:3000])
c.close()
