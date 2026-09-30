# -*- coding: utf-8 -*-
"""完整回归：对话窗口纯聊 + 最终方案评分 + 追问显示 + 追问答案续评"""
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

def sse(url, token, payload, timeout=120):
    events = []
    with requests.post(url, headers={'Content-Type': 'application/json', 'Authorization': token},
                       json=payload, stream=True, timeout=timeout) as r:
        ev = None
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            if raw.startswith('event:'):
                ev = raw[6:].strip()
            elif raw.startswith('data:'):
                try:
                    events.append({'event': ev, 'data': json.loads(raw[5:].strip())})
                except Exception:
                    events.append({'event': ev, 'data': raw[5:].strip()})
    return events

# 教师建班+对话题+加题
tacc = f'rg_t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
_, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
_, b = api('POST', '/classes', token=tt, json={'name': f'回归班级{TS}', 'description': 'plainchat', 'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
cid = b['data']['id']
_, b = api('POST', '/questions', token=tt, json={
    'type': 'DIALOGUE', 'title': f'理财对话{TS}', 'content': '你获得5000元奖学金想理财，AI建议"年化15%风险较低"。请与AI多轮对话，最终给出300字内个人决策说明。',
    'options': '', 'answer': '', 'rubric': '判断学生能否识别收益夸大、数据可靠性、风险指标，并明确哪些采纳AI、哪些需自行查证、最终决策责任。',
    'difficulty': '3', 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解'], 'visibility': 'private'})
qid = b['data']['id']
api('POST', f'/classes/{cid}/questions/{qid}', token=tt)
print('班级', cid, '题', qid)

sacc = f'rg_s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
_, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
_, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
aid = b['data']['assessmentId']
_, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
print('开题 aid=', aid, '题=', (b['data'].get('question') or {}).get('id'))

print('\n[1] 对话窗口 /chat 纯聊（不评分）')
ev = sse(f'{API}/assessments/{aid}/chat', st, {'content': '先帮我算一下5000元按15%年化一年收益多少？'})
print('  事件:', [(e['event'], list((e['data'] or {}).keys())) for e in ev], '| 回复:', (ev[-1]['data'] or {}).get('reply', '')[:50])
_, conv = api('GET', f'/assessments/{aid}/conversation', token=st)
cur = conv['data'].get('currentQuestion') or {}
print('  对话后题未推进:', cur.get('status'), '| followUps:', len(conv['data'].get('followUps') or []))

print('\n[2] 提交最终方案 /chat/stream（应评分并可能追问）')
ev = sse(f'{API}/assessments/{aid}/chat/stream', st, {'content': 'AI的"年化15%低风险"不可信，回测不等于实盘，我会查证数据来源，自己承担决策责任。'})
for e in ev:
    print('  event:', e['event'], '|', json.dumps(e['data'], ensure_ascii=False)[:130])

print('\n[3] conversation followUps（追问应在左侧显示）')
_, conv = api('GET', f'/assessments/{aid}/conversation', token=st)
fu = conv['data'].get('followUps') or []
print('  followUps:', len(fu))
for f in fu:
    print('   -', json.dumps(f, ensure_ascii=False)[:120])

print('\n[4] 追问答案在最终方案框提交（应继续评分）')
ev = sse(f'{API}/assessments/{aid}/chat/stream', st, {'content': '我依据有三：一是回测区间和实盘不同；二是15%远超无风险利率；三是AI不承担损失责任。我会分步核实并保守决策。'})
for e in ev:
    print('  event:', e['event'], '|', json.dumps(e['data'], ensure_ascii=False)[:130])
_, conv = api('GET', f'/assessments/{aid}/conversation', token=st)
print('  最终 currentQuestion:', json.dumps(conv['data'].get('currentQuestion'), ensure_ascii=False)[:120])
print('  questions 状态:', [(q.get('type'), q.get('status')) for q in conv['data'].get('questions') or []])
print('=== REGRESSION DONE ===')
