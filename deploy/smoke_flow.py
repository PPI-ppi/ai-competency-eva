# -*- coding: utf-8 -*-
"""正确流程冒烟：start → next-question → score-result（客观题）→ 再看下一题"""
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

# 复用班级 36（已含题 749：AI基本概念理解/SINGLE_CHOICE/难度3）
sacc = f'f9s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
code, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
print('学生', sacc, 'uid=', uid)

code, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': 36})
d = b.get('data') or {}
aid = d.get('assessmentId')
print('start ->', code, '| assessmentId:', aid, '| status:', d.get('status'), '| questionCount:', d.get('questionCount'))

# next-question 出题
code, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
d2 = b.get('data') or {}
q = d2.get('question') or {}
print('next-question ->', code, '| finished:', d2.get('finished'), '| 题:', q.get('type'), json.dumps(q, ensure_ascii=False)[:200])

# 答客观题：提交选项全文（第一项即正确答案）
if q and q.get('type') in ('SINGLE_CHOICE', 'SINGLE'):
    opts = (q.get('options') or '').split('\n')
    code, b = api('POST', '/agent/engine/score-result', token=st, uid=uid,
                  json={'assessmentId': aid, 'questionId': q.get('id'), 'answerContent': opts[0], 'score': 100, 'r': 1.0})
    out = b.get('data') or {}
    print('score-result ->', code, '| resultStatus:', out.get('resultStatus'), '| needFollowUp:', out.get('needFollowUp'))

    # 再 next-question 看是否推进（对话题/下一题/结束）
    code, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
    d3 = b.get('data') or {}
    q3 = d3.get('question') or {}
    print('再 next-question ->', code, '| finished:', d3.get('finished'), '| reason:', d3.get('reason'), '| 下一题:', q3.get('type'), json.dumps(q3, ensure_ascii=False)[:160])
print('=== 流程冒烟 DONE ===')
