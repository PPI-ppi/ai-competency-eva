# -*- coding: utf-8 -*-
"""验证：最近完成测评的 result 是否含 skillTree/beforeDimensions/维度analysis"""
import os, sys, io, json, time, requests, paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
HOST = '120.26.93.206'
API = 'http://%s/api' % HOST
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username='root', password=os.environ.get('SSHPASS'), timeout=30)

def run(cmd, timeout=60):
    _, out, err = c.exec_command(cmd, timeout=timeout)
    return out.read().decode('utf-8', 'replace').strip(), err.read().decode('utf-8', 'replace').strip()

o, _ = run("mysql -uroot ai_assessment -N -e \"SELECT id, class_id, student_user_id, status FROM assessments WHERE status='completed' AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 3\"")
print('最近测评:\n' + (o or '无'))
rows = [x.split('\t') for x in o.splitlines()] if o else []
c.close()
if not rows:
    print('NO COMPLETED ASSESSMENT'); sys.exit(0)
aid, cid, uid, status = rows[0]
print('验证 assessmentId=%s classId=%s userId=%s' % (aid, cid, uid))

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    r = requests.request(method, API + path, headers=h, timeout=60, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]

# 学生账号（已有则直接登录）
acc = 'verify_rep'
api('POST', '/auth/register/student', json={'account': acc, 'password': 'Smoke@12345', 'name': '验证报告', 'nickname': 'vr'})
code, b = api('POST', '/auth/login', json={'account': acc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']
print('student token', code)

code, b = api('GET', '/assessments/%s/result' % aid, token=st)
print('result', code)
snap = b.get('data') or b
dims = snap.get('dimensions') or []
before = snap.get('beforeDimensions') or []
tree = snap.get('skillTree') or []
advice = snap.get('advice') or ''
print('--- dimensions(%d) ---' % len(dims))
for d in dims:
    print(' ', d.get('dimension'), d.get('score'), '| analysis:', (d.get('analysis') or '')[:48])
print('--- beforeDimensions(%d) ---' % len(before))
for bv in before:
    print(' ', bv.get('dimension'), bv.get('score'))
print('--- skillTree(%d) ---' % len(tree))
for t in tree:
    print(' ', t.get('dimension'), '|', t.get('name'), t.get('score'), t.get('status'), t.get('lit'))
print('--- advice head ---', str(advice)[:80].replace('\n', ' '))
