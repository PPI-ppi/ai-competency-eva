# -*- coding: utf-8 -*-
"""验证 /api/reports/{id}/snapshot 对注入报告可用"""
import io, sys, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
r = requests.post(API + '/auth/login', json={'account': '呕', 'password': '123456789', 'role': 'student'}, timeout=60)
st = r.json()['data']['tokenValue']
h = {'Authorization': st}
for aid in (234, 235, 236):
    r = requests.get(f'{API}/reports/{aid}/snapshot', headers=h, timeout=60)
    b = r.json()
    d = b.get('data') or {}
    print(f'== snapshot {aid} == code={b.get("code")} msg={b.get("message")}')
    if d:
        print('  assessment.totalScore:', (d.get('assessment') or {}).get('totalScore'))
        print('  dimensions:', [(x.get('name'), x.get('score'), x.get('status')) for x in (d.get('dimensions') or [])])
        print('  points:', len(d.get('points') or []), ' advice:', type(d.get('advice')).__name__)
