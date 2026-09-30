# -*- coding: utf-8 -*-
"""端到端验证 result() 增强：建班(1点)→答题→收尾→验证 skillTree/beforeDimensions/analysis"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]

def api(method, path, token=None, uid=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    if uid: h['X-User-Id'] = str(uid)
    r = requests.request(method, API + path, headers=h, timeout=120, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]

tacc = f'rt_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'报{TS}', 'nickname': f't{TS}'})
code, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
code, b = api('POST', '/classes', token=tt, json={'name': f'报告验证{TS}', 'description': 'report', 'pointWeights': {'AI基本概念理解': 10}})
cid = b['data']['id']
print('建班', code, 'classId=', cid)

code, b = api('GET', '/questions/public', token=tt)
qs = b.get('data') or []
q = next((x for x in qs if x.get('type') in ('SINGLE_CHOICE', 'SINGLE') and 'AI' in str(x.get('stem', ''))), None) \
    or next((x for x in qs if x.get('type') in ('SINGLE_CHOICE', 'SINGLE')), None)
if not q:
    print('无公共客观题', json.dumps(b, ensure_ascii=False)[:200]); sys.exit(0)
code, b = api('POST', f'/classes/{cid}/questions/{q["id"]}', token=tt)
print('加题 ->', code)

sacc = f'rs_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
code, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']

code, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
d = b.get('data') or {}
aid = d.get('assessmentId')
print('start ->', code, 'assessmentId=', aid)

# 循环答题直到 finished
for turn in range(6):
    q1 = (d.get('currentQuestion') or d.get('question') or {})
    if not q1:
        code, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
        d = b.get('data') or {}
        q1 = d.get('currentQuestion') or d.get('question') or {}
        print('next-question ->', code, '| q:', (q1.get('content') or q1.get('stem') or '')[:30])
    if not q1:
        print('无当前题，状态:', d.get('status') or b); break
    opts = (q1.get('options') or '')
    if opts.startswith('['):
        import json as _json
        opts = _json.loads(opts)
    else:
        opts = opts.split('\n')
    code, b = api('POST', '/agent/engine/score-result', token=st, uid=uid,
                  json={'assessmentId': aid, 'questionId': q1.get('id'), 'answerContent': opts[0], 'score': 100, 'r': 1.0})
    d = b.get('data') or {}
    print('作答 ->', code, '| next:', d.get('nextQuestionType') or d.get('outcome') or d.get('status') or '', '| qs:', d.get('questions') or '')
    if d.get('finished') or (isinstance(b, dict) and b.get('data', {}).get('finished')):
        break

code, b = api('GET', f'/assessments/{aid}/result', token=st, uid=uid)
print('result ->', code)
snap = b.get('data') or b
dims = snap.get('dimensions') or []
before = snap.get('beforeDimensions') or []
tree = snap.get('skillTree') or []
advice = snap.get('advice') or ''
print('--- dimensions(%d) ---' % len(dims))
for dv in dims:
    print(' ', dv.get('dimension'), dv.get('score'), '| analysis:', (dv.get('analysis') or '')[:50])
print('--- beforeDimensions(%d) ---' % len(before))
for bv in before:
    print(' ', bv.get('dimension'), bv.get('score'))
print('--- skillTree(%d) ---' % len(tree))
for t in tree:
    print(' ', t.get('dimension'), '|', t.get('name'), t.get('score'), t.get('status'), t.get('lit'))
print('--- advice head ---', str(advice)[:70].replace('\n', ' '))
