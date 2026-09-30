# -*- coding: utf-8 -*-
"""追问链路验证：对话题提交模糊/差答案 → 期望 followup 事件 + conversation.followUps 非空"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]
T = f'fu_t_{TS}'
S = f'fu_s_{TS}'
PW = 'Smoke@12345'

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token:
        h['Authorization'] = token
    r = requests.request(method, BASE + path, headers=h, timeout=120, **kw)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, r.text[:300]

def ok(name, code):
    print(f"[{'OK ' if code == 200 else 'FAIL'}] {name} -> {code}")
    return code == 200

code, b = api('POST', '/auth/register/teacher', json={'account': T, 'password': PW, 'name': f'追问教师{TS}', 'nickname': f'追{TS}'})
if not ok('注册教师', code): raise SystemExit
code, b = api('POST', '/auth/login', json={'account': T, 'password': PW, 'role': 'teacher'})
tt = b['data']['tokenValue']
code, b = api('POST', '/classes', token=tt, json={'name': f'追问班级{TS}', 'description': '', 'pointWeights': {'提示词书写': 10}})
if not ok('创建组织', code): raise SystemExit
cid = b['data']['id']
code, b = api('POST', '/questions', token=tt, json={
    'type': 'DIALOGUE', 'title': f'追问题{TS}', 'content': '请说说什么是提示词工程？',
    'options': None, 'answer': None, 'rubric': '能说明提示词的定义、要素与作用',
    'difficulty': 2, 'tags': ['提示词工程'], 'assessmentPoints': ['提示词书写']})
if not ok('建对话题', code): raise SystemExit
qid = b['data']['id']
code, b = api('POST', f'/classes/{cid}/questions/{qid}', token=tt, json={})
ok('加题入班', code)
code, b = api('POST', f'/classes/{cid}/assessment-tasks', token=tt, json={
    'title': f'追问任务{TS}', 'description': '', 'questionCount': 2, 'estimatedDuration': 10})
if not ok('发布任务', code): raise SystemExit
tid = b['data']['id']
code, b = api('POST', '/auth/register/student', json={'account': S, 'password': PW, 'name': f'追问学生{TS}', 'nickname': f'学{TS}'})
ok('注册学生', code)
code, b = api('POST', '/auth/login', json={'account': S, 'password': PW, 'role': 'student'})
st = b['data']['tokenValue']
code, b = api('POST', f'/classes/{cid}/invite-code', token=tt, json={})
inv = b['data']['code']
code, b = api('POST', '/classes/join', token=st, json={'inviteCode': inv})
ok('学生加入', code)
code, b = api('POST', f'/assessment-tasks/{tid}/start', token=st, json={})
aid = b['data']['id']
print('   assessmentId =', aid)

# 开题
code, b = api('GET', f'/assessments/{aid}/conversation', token=st)
q = (b.get('data') or {}).get('question') or (b.get('data') or {}).get('currentQuestion')
if not q:
    ev_name, ev_payload = None, None
    with requests.post(BASE + f'/assessments/{aid}/chat/stream', headers={'Authorization': st}, json={'content': ''}, stream=True, timeout=120) as r:
        for line in r.iter_lines(decode_unicode=True):
            if line.startswith('event:'):
                ev_name = line[6:].strip()
            elif line.startswith('data:'):
                try:
                    ev_payload = json.loads(line[5:])
                except Exception:
                    ev_payload = line[5:]
                if ev_name == 'question':
                    q = ev_payload
                    break
print('   当前题:', q.get('type'), str(q.get('content'))[:30])

# 提交模糊答案（无 action）→ 期望 followup
print('--- 提交模糊答案(无action): "好像跟写提示词有关？" ---')
ev_name = None
with requests.post(BASE + f'/assessments/{aid}/chat/stream', headers={'Authorization': st},
                   json={'content': '好像跟写提示词有关？'}, stream=True, timeout=150) as r:
    for line in r.iter_lines(decode_unicode=True):
        if line.startswith('event:'):
            ev_name = line[6:].strip()
        elif line.startswith('data:'):
            try:
                ev = json.loads(line[5:])
            except Exception:
                ev = line[5:]
            print('   event:', ev_name, str(ev)[:200])
time.sleep(2)
code, b = api('GET', f'/assessments/{aid}/conversation', token=st)
conv = b.get('data', {})
fups = conv.get('followUps') or []
print('   [追问后] followUps 条数:', len(fups))
for fu in fups[:3]:
    print('     追问内容:', str(fu.get('content'))[:100])
print('   [追问后] currentQuestion status:', (conv.get('question') or conv.get('currentQuestion') or {}).get('status'))

# 提交追问答案 → 期望 answered + 下一题/收尾（多轮追问循环，最多 4 轮）
answers = [
    '提示词工程就是设计高质量指令的方法，包括角色设定、任务拆解、提供上下文和约束条件等。',
    '角色设定让模型进入专业视角，任务拆解把复杂目标分成小步骤，上下文提供背景信息，约束条件限定输出格式和范围。',
    '这些要素能显著提升输出质量：角色设定保证专业性，拆解降低出错率，上下文避免答非所问，约束确保格式合规。']
round_no = 0
for answer in answers:
    round_no += 1
    print(f'--- 第{round_no}轮答复(无action) ---')
    ev_name = None
    got = []
    with requests.post(BASE + f'/assessments/{aid}/chat/stream', headers={'Authorization': st},
                       json={'content': answer}, stream=True, timeout=150) as r:
        for line in r.iter_lines(decode_unicode=True):
            if line.startswith('event:'):
                ev_name = line[6:].strip()
            elif line.startswith('data:'):
                try:
                    ev = json.loads(line[5:])
                except Exception:
                    ev = line[5:]
                got.append((ev_name, ev))
                print('   event:', ev_name, str(ev)[:150])
    if any(n == 'answered' for n, _ in got) or any(n == 'finished' for n, _ in got):
        break
time.sleep(2)
code, b = api('GET', f'/assessments/{aid}/conversation', token=st)
conv = b.get('data', {})
print('   [终态] questions:', [
    {k: it.get(k) for k in ('id', 'type', 'status', 'answered', 'completed')} for it in (conv.get('questions') or [])])
print('   [终态] followUps 条数:', len(conv.get('followUps') or []))
print('=== FU SMOKE DONE ===')
