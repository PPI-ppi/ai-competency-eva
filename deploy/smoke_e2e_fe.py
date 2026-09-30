# -*- coding: utf-8 -*-
"""完整链路冒烟：建班→加公共题→开题→客观题判分→下一题/追问字段"""
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

# 教师建班
tacc = f'f9t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
code, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
code, b = api('POST', '/classes', token=tt, json={'name': f'全链班级{TS}', 'description': 'e2e', 'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
cid = b['data']['id']
print('建班', code, 'classId=', cid)

# 找公共客观题
code, b = api('GET', '/questions/public', token=tt)
qs = b.get('data') or []
q = next((x for x in qs if x.get('type') in ('SINGLE_CHOICE', 'SINGLE')), None)
if not q:
    print('公共题库无客观题', json.dumps(b, ensure_ascii=False)[:200]); sys.exit(0)
print('公共题:', q.get('id'), q.get('type'), q.get('stem', '')[:40])

# 加入班级（会触发变体生成）
code, b = api('POST', f'/classes/{cid}/questions/{q["id"]}', token=tt)
print('加题 ->', code, json.dumps(b, ensure_ascii=False)[:220])

# 学生开题
sacc = f'f9s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
code, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
code, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
print('engine/start ->', code)
d = b.get('data') or {}
aid = d.get('assessmentId'); q1 = d.get('currentQuestion') or {}
print('  assessmentId:', aid, '| taskId:', d.get('taskId'), '| 题目:', q1.get('type'), json.dumps(q1, ensure_ascii=False)[:160])

# 答客观题（选项全文）
if q1 and q1.get('type') in ('SINGLE_CHOICE', 'SINGLE'):
    opts = (q1.get('options') or '').split('\n')
    code, b = api('POST', '/agent/engine/score-result', token=st, uid=uid,
                  json={'assessmentId': aid, 'taskId': d.get('taskId'), 'questionId': q1.get('id'), 'content': opts[0]})
    print('客观题提交 ->', code, json.dumps(b, ensure_ascii=False)[:400])
print('=== E2E SMOKE DONE ===')
