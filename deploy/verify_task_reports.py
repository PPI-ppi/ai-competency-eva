# -*- coding: utf-8 -*-
"""验证任务报告：学生端 reports 列表/详情 + 教师端 taskResults + 画像"""
import io, sys, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'

def login(account, password, role):
    r = requests.post(API + '/auth/login', json={'account': account, 'password': password, 'role': role}, timeout=60)
    return r.json().get('data', {}).get('tokenValue')

# 学生端：呕
st = login('呕', '123456789', 'student')
h = {'Authorization': st}
r = requests.get(API + '/reports', headers=h, timeout=60)
rows = r.json().get('data') or []
tasks = [x for x in rows if x.get('taskId') and str(x.get('classId')) == '37']
print('== 学生端 reports：任务报告(class37) ==')
for x in tasks:
    print(x.get('id'), '|', x.get('taskTitle'), '|', x.get('averageScore'), x.get('abilityLevel'), '|', x.get('status'), '|', x.get('completedAt'))

for aid in (238, 239, 240):
    r = requests.get(f'{API}/reports/{aid}/snapshot', headers=h, timeout=60)
    d = (r.json().get('data') or {})
    print(f'== snapshot {aid} ==', r.json().get('code'),
          'total:', (d.get('assessment') or {}).get('totalScore'),
          'taskTitle:', (d.get('assessment') or {}).get('taskTitle'),
          'dims有analysis:', all(bool(x.get('analysis')) for x in (d.get('dimensions') or [])),
          'skillTree:', len(d.get('skillTree') or []), 'advice:', bool(d.get('advice')),
          'q/a:', len(d.get('questions') or []), '/', len(d.get('answers') or []))

# 画像 latest
r = requests.get(API + '/classes/37/my-ability', headers=h, timeout=60)
d = r.json().get('data') or {}
print('== 画像 latest ==', json.dumps(d.get('latest'), ensure_ascii=False)[:200])
print('trend:', [x.get('averageScore') for x in (d.get('trend') or [])])

# 教师端：测试1
t = login('测试1', '123456789', 'teacher') or login('测试1', 'Smoke@12345', 'teacher')
print('教师登录 token:', bool(t))
if t:
    th = {'Authorization': t}
    for tk in (21, 22, 23):
        r = requests.get(f'{API}/teacher/assessment-tasks/{tk}/results', headers=th, timeout=60)
        d = r.json().get('data') or []
        print(f'== 任务 {tk} results ==', [(x.get('studentAccount') or x.get('studentName'), x.get('averageScore'), x.get('abilityLevel')) for x in d][:3])
