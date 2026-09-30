# -*- coding: utf-8 -*-
"""验证：/reports 列表中呕(class37)的记录字段"""
import io, sys, json, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
r = requests.post(API + '/auth/login', json={'account': '呕', 'password': '123456789', 'role': 'student'}, timeout=60)
st = r.json()['data']['tokenValue']
h = {'Authorization': st}
r = requests.get(API + '/reports', headers=h, timeout=60)
rows = r.json().get('data') or []
mine = [x for x in rows if str(x.get('classId') or x.get('class_id') or x.get('classRoomId')) == '37']
print('呕/class37 记录数:', len(mine))
for x in mine[:8]:
    print(json.dumps({k: x.get(k) for k in ('id','reportId','assessmentId','status','classId','class_id','classRoomId','averageScore','totalScore','score','abilityLevel','completedAt','updatedAt','createdAt','reportType','type','title','name','taskId')}, ensure_ascii=False))
