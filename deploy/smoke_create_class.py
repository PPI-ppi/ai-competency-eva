# -*- coding: utf-8 -*-
"""按 v9 前端真实契约验证创建组织：{name, description, assessmentPointWeights:[{dimension,assessmentPoint,weight:0-1}]}"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]
T = f'cc_t_{TS}'
PW = 'Smoke@12345'

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token:
        h['Authorization'] = token
    r = requests.request(method, BASE + path, headers=h, timeout=60, **kw)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]

code, b = api('POST', '/auth/register/teacher', json={'account': T, 'password': PW, 'name': f'建班教师{TS}', 'nickname': f'建{TS}'})
print('注册教师', code)
code, b = api('POST', '/auth/login', json={'account': T, 'password': PW, 'role': 'teacher'})
tt = b['data']['tokenValue']

# v9 前端实际 payload（考察点权重合计 100% = 0.8 + 0.2）
payload = {
    'name': f'V9契约验证班级{TS}',
    'description': 'assessmentPointWeights 数组格式',
    'assessmentPointWeights': [
        {'dimension': 'AI基础认知', 'assessmentPoint': 'AI基本概念理解', 'weight': 0.8},
        {'dimension': '提示词工程', 'assessmentPoint': '提示词书写', 'weight': 0.2},
    ],
}
code, b = api('POST', '/classes', token=tt, json=payload)
print(f'POST /api/classes (v9格式) -> {code}')
d = b.get('data') or {}
print('  返回:', json.dumps(d, ensure_ascii=False)[:300])

# 再验证旧契约 pointWeights Map 仍可用
code, b = api('POST', '/classes', token=tt, json={
    'name': f'老契约验证班级{TS}', 'description': 'pointWeights Map 格式',
    'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
print(f'POST /api/classes (老格式) -> {code}')
print('  返回:', json.dumps(b.get('data') or {}, ensure_ascii=False)[:200])
print('=== CC SMOKE DONE ===')
