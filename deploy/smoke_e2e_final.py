# -*- coding: utf-8 -*-
"""最终闭环：教师建题→加入班级→学生开题→答客观题判分"""
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

tacc = f'f9t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
code, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']

# 建班
code, b = api('POST', '/classes', token=tt, json={'name': f'闭环班级{TS}', 'description': 'e2e-final', 'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
cid = b['data']['id']
print('建班', code, 'classId=', cid)

# 建客观题
qpayload = {
    'type': 'SINGLE_CHOICE',
    'title': f'提示词设计单选题{TS}',
    'content': '在设计高质量提示词时，以下哪一项最有助于模型准确理解任务目标？',
    'options': '明确角色、任务、约束条件和输出格式\n只提供尽可能多的背景文字\n使用大量专业术语但不说明目标\n省略示例以减少提示词长度',
    'answer': 'A',
    'rubric': '',
    'difficulty': '3',
    'tags': ['AI基础认知'],
    'assessmentPoints': ['AI基本概念理解'],
    'visibility': 'private',
}
code, b = api('POST', '/questions', token=tt, json=qpayload)
qid = (b.get('data') or {}).get('id')
print('建题', code, 'qid=', qid, json.dumps(b, ensure_ascii=False)[:120])

# 加入班级
code, b = api('POST', f'/classes/{cid}/questions/{qid}', token=tt)
print('加题 ->', code, json.dumps(b, ensure_ascii=False)[:200])

# 学生开题
sacc = f'f9s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
code, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
code, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
d = b.get('data') or {}
aid = d.get('assessmentId'); q1 = d.get('currentQuestion') or {}
print('engine/start ->', code, '| assessmentId:', aid, '| 题:', q1.get('type'), json.dumps(q1, ensure_ascii=False)[:180])

# 答客观题：提交选项全文
if q1 and q1.get('type') in ('SINGLE_CHOICE', 'SINGLE'):
    opts = (q1.get('options') or '').split('\n')
    code, b = api('POST', '/agent/engine/score-result', token=st, uid=uid,
                  json={'assessmentId': aid, 'taskId': d.get('taskId'), 'questionId': q1.get('id'), 'content': opts[0]})
    print('客观题提交(选A全文) ->', code)
    print('  返回:', json.dumps(b, ensure_ascii=False)[:500])
    if code == 200 and (b.get('data') or {}).get('currentQuestion'):
        print('  ✅ 已下发下一题，左栏可推进')
print('=== FINAL E2E DONE ===')
