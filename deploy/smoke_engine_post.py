# -*- coding: utf-8 -*-
"""补测：engine/start + 客观题 + 对话题 + followup（带 X-User-Id）"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]

def api(method, path, token=None, uid=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    if uid: h['X-User-Id'] = str(uid)
    r = requests.request(method, API + path, headers=h, timeout=90, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]

acc = f'f9_s_{TS}'
code, b = api('POST', '/auth/register/student', json={'account': acc, 'password': 'Smoke@12345', 'name': f'学生{TS}', 'nickname': f's{TS}'})
code, b = api('POST', '/auth/login', json={'account': acc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']
uid = b['data']['user']['id']
print('学生', acc, 'id=', uid)

code, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': 32})
print('engine/start ->', code, json.dumps(b, ensure_ascii=False)[:300])
if code == 200:
    task_id = (b.get('data') or {}).get('taskId') or (b.get('taskId'))
    q = (b.get('data') or {}).get('currentQuestion') or {}
    print('taskId:', task_id, '| 题目:', json.dumps(q, ensure_ascii=False)[:200])
    qid = q.get('id')
    if qid and q.get('type') == 'SINGLE_CHOICE':
        opts = q.get('options', '').split('\n')
        code, b2 = api('POST', '/agent/engine/score-result', token=st, uid=uid,
                       json={'taskId': task_id, 'questionId': qid, 'content': opts[0]})
        print('客观题提交 ->', code, json.dumps(b2, ensure_ascii=False)[:300])
print('=== ENGINE SMOKE DONE ===')
