# -*- coding: utf-8 -*-
"""部署后回归：公网静态资源 + 创建组织 + 测评引擎关键接口"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
WEB = 'http://120.26.93.206/ripple-ai-assessment/'
API = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]

def web(path):
    r = requests.get(WEB + path, timeout=30)
    return r.status_code, r.headers.get('Content-Type', ''), len(r.content)

print('=== 静态资源 ===')
for p in ['', 'assets/index-pGvfEsyP.js', 'assets/index-BRuEaqxN.css']:
    s, ct, n = web(p)
    print(f'{p or "(首页)"} -> {s} | {ct} | {n}B')

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    r = requests.request(method, API + path, headers=h, timeout=60, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]

print('\n=== weight-support（前端解锁依赖） ===')
code, b = api('GET', '/classes/weight-support')
print(code, json.dumps(b.get('data') or b, ensure_ascii=False)[:200])

print('\n=== 创建组织（新前端 pointWeights 契约） ===')
code, b = api('POST', '/auth/register/teacher', json={'account': f'f9_t_{TS}', 'password': 'Smoke@12345', 'name': f'前端验证{TS}', 'nickname': f'f9{TS}'})
print('注册教师', code)
code, b = api('POST', '/auth/login', json={'account': f'f9_t_{TS}', 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
code, b = api('POST', '/classes', token=tt, json={'name': f'前端契约班级{TS}', 'description': 'frontend-v9 pointWeights', 'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
print('建班', code, json.dumps(b.get('data') or {}, ensure_ascii=False)[:180])

print('\n=== 测评引擎（白名单已放行） ===')
code, b = api('POST', '/auth/register/student', json={'account': f'f9_s_{TS}', 'password': 'Smoke@12345', 'name': f'学生{TS}', 'nickname': f's{TS}'})
print('注册学生', code)
code, b = api('POST', '/auth/login', json={'account': f'f9_s_{TS}', 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']
code, b = api('POST', '/agent/engine/start', token=st, json={'classId': 32, 'taskId': None, 'studentId': None})
print('engine/start', code, json.dumps(b, ensure_ascii=False)[:220])
print('=== DEPLOY SMOKE DONE ===')
