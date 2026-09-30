# -*- coding: utf-8 -*-
"""验证 AI 变题接口：POST /api/classes/{id}/questions/{qid}/generate-training（原 404）"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]
T = f'gt_t_{TS}'
PW = 'Smoke@12345'

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token:
        h['Authorization'] = token
    r = requests.request(method, BASE + path, headers=h, timeout=180, **kw)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]

code, b = api('POST', '/auth/register/teacher', json={'account': T, 'password': PW, 'name': f'变题教师{TS}', 'nickname': f'变{TS}'})
print('注册教师', code)
code, b = api('POST', '/auth/login', json={'account': T, 'password': PW, 'role': 'teacher'})
tt = b['data']['tokenValue']
code, b = api('POST', '/classes', token=tt, json={'name': f'变题班级{TS}', 'description': '', 'pointWeights': {'提示词书写': 10}})
print('创建组织', code, 'classId=', b.get('data', {}).get('id'))
cid = b['data']['id']
code, b = api('POST', '/questions', token=tt, json={
    'type': 'DIALOGUE', 'title': f'变题源题{TS}', 'content': '什么是大语言模型？',
    'options': None, 'answer': None, 'rubric': '能解释大语言模型的基本概念与原理',
    'difficulty': 2, 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解']})
print('建题', code, 'qid=', b.get('data', {}).get('id'))
qid = b['data']['id']
code, b = api('POST', f'/classes/{cid}/questions/{qid}', token=tt, json={})
print('加题入班', code, 'trainingStatus=', (b.get('data') or {}).get('trainingStatus'))
t0 = time.time()
code, b = api('POST', f'/classes/{cid}/questions/{qid}/generate-training', token=tt, json={})
print(f'generate-training -> {code} ({time.time()-t0:.1f}s)')
d = b.get('data') or {}
print('  返回:', json.dumps(d, ensure_ascii=False)[:300])
code, b = api('GET', f'/classes/{cid}/questions', token=tt)
rows = b.get('data') or []
kinds = {}
for r in rows:
    k = r.get('questionKind') or '?'
    kinds[k] = kinds.get(k, 0) + 1
print('班级题目 kinds:', kinds)
print('=== GT SMOKE DONE ===')
