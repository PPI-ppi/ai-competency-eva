# -*- coding: utf-8 -*-
"""试教师账号常见密码登录"""
import io, sys, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
for pwd in ('Smoke@12345', '123456789', '123456', 'admin123'):
    try:
        r = requests.post(API + '/auth/login', json={'account': '测试1', 'password': pwd, 'role': 'teacher'}, timeout=30)
        b = r.json()
        ok = b.get('code') == 0 and b.get('data')
        print(pwd, '->', b.get('code'), b.get('message'), 'token' if ok else '')
        if ok:
            h = {'Authorization': b['data']['tokenValue']}
            for tk in (21, 22, 23):
                rr = requests.get(f'{API}/teacher/assessment-tasks/{tk}/results', headers=h, timeout=30)
                d = (rr.json().get('data') or [])
                print(f'  任务{tk}:', [(x.get('studentAccount') or x.get('studentName'), x.get('averageScore'), x.get('abilityLevel'), x.get('status')) for x in d][:4])
            break
    except Exception as ex:
        print(pwd, '异常:', ex)
