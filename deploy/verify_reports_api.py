# -*- coding: utf-8 -*-
"""验证：呕账号画像 + 报告列表 + 报告详情完整"""
import io, sys, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    r = requests.request(method, API + path, headers=h, timeout=180, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:300]

_, b = api('POST', '/auth/login', json={'account': '呕', 'password': '123456789', 'role': 'student'})
print('登录:', b.get('code'), b.get('message'))
st = b['data']['tokenValue']

code, b = api('GET', '/classes/37/my-ability', token=st)
d = b.get('data') or {}
print('== my-ability ==')
print('latest:', json.dumps(d.get('latest'), ensure_ascii=False)[:200])
print('dimensions:', json.dumps(d.get('dimensions'), ensure_ascii=False)[:300])
print('trend:', json.dumps(d.get('trend'), ensure_ascii=False)[:300])
print('previous:', json.dumps(d.get('previous'), ensure_ascii=False)[:150])

code, b = api('GET', '/reports', token=st)
rows = b.get('data') or []
print('== reports 列表(%d) ==' % len(rows))
for r in rows:
    if r.get('classId') == 37 or r.get('class_id') == 37:
        print(r.get('id'), r.get('status'), r.get('averageScore'), r.get('abilityLevel'), r.get('completedAt'))

for aid in (234, 235, 236):
    code, b = api('GET', f'/assessments/{aid}/result', token=st)
    d = b.get('data') or {}
    print(f'== result {aid} ==', b.get('code'))
    print('  total:', d.get('assessment', {}).get('totalScore') if isinstance(d.get('assessment'), dict) else d.get('assessment'))
    print('  dimensions:', [(v.get('name'), v.get('score'), bool(v.get('analysis'))) for v in (d.get('dimensions') or [])])
    print('  skillTree:', [(v.get('name'), v.get('score'), v.get('status')) for v in (d.get('skillTree') or [])])
    print('  advice有:', bool(d.get('advice')))
