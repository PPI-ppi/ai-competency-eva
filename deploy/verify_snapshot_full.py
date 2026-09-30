# -*- coding: utf-8 -*-
"""后端健康检查 + snapshot 全链路验证"""
import os, sys, io, time, json, paramiko, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
time.sleep(5)
API = 'http://120.26.93.206/api'
r = requests.post(API + '/auth/login', json={'account': '呕', 'password': '123456789', 'role': 'student'}, timeout=60)
print('登录:', r.status_code, r.json().get('code'), r.json().get('message'))
st = r.json()['data']['tokenValue']
h = {'Authorization': st}
for aid in (234, 235, 236):
    r = requests.get(f'{API}/reports/{aid}/snapshot', headers=h, timeout=60)
    b = r.json()
    d = b.get('data') or {}
    print(f'== snapshot {aid} == code={b.get("code")}')
    if not d: continue
    print('  total:', (d.get('assessment') or {}).get('totalScore'), (d.get('assessment') or {}).get('averageScore'))
    print('  dims(with analysis):', [(x.get('name'), x.get('score'), bool(x.get('analysis'))) for x in (d.get('dimensions') or [])])
    print('  beforeDims:', [(x.get('name'), x.get('score')) for x in (d.get('beforeDimensions') or [])][:6])
    print('  skillTree:', len(d.get('skillTree') or []), 'advice:', bool(d.get('advice')))
    print('  questions:', len(d.get('questions') or []), 'answers:', len(d.get('answers') or []))
