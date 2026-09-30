# -*- coding: utf-8 -*-
"""SSE 真实流程 → 收尾 → 验证 result() 的 skillTree/beforeDimensions/analysis"""
import sys, io, json, time, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
API = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]

def api(method, path, token=None, uid=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = token
    if uid: h['X-User-Id'] = str(uid)
    r = requests.request(method, API + path, headers=h, timeout=180, **kw)
    try: return r.status_code, r.json()
    except Exception: return r.status_code, r.text[:200]

def sse(url, token, payload, timeout=180):
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

tacc = f'rv_t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
_, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
_, b = api('POST', '/classes', token=tt, json={'name': f'报告验证{TS}', 'description': 'report', 'pointWeights': {'AI基本概念理解': 10}})
cid = b['data']['id']
_, b = api('POST', '/questions', token=tt, json={
    'type': 'DIALOGUE', 'title': f'理财对话{TS}', 'content': '你获得5000元奖学金想理财，AI建议"年化15%风险较低"。请与AI多轮对话，最终给出300字内个人决策说明。',
    'options': '', 'answer': '', 'rubric': '判断学生能否识别收益夸大、数据可靠性、风险指标，并明确哪些采纳AI、哪些需自行查证、最终决策责任。',
    'difficulty': '3', 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解'], 'visibility': 'private'})
qid = b['data']['id']
api('POST', f'/classes/{cid}/questions/{qid}', token=tt)
print('班级', cid, '题', qid)

sacc = f'rv_s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
_, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
_, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
aid = b['data']['assessmentId']
_, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
print('开题 aid=', aid, '题=', (b['data'].get('question') or {}).get('id'))

# 提交最终方案直到 finished（含追问多轮）
answers = [
    'AI的"年化15%低风险"不可信，回测不等于实盘，我会查证数据来源，自己承担决策责任。',
    '我依据有三：一是回测区间和实盘不同；二是15%远超无风险利率；三是AI不承担损失责任。我会分步核实并保守决策。',
    '我决定只将5000元中的3000元配置低风险货币基金，2000元定投指数基金，不采信高收益承诺，决策责任在我自己。',
    '这是我最终的完整决策说明：经过与AI的多轮核实，我确认高收益承诺缺乏可靠数据支撑，最终选择分散配置、本人承担全部决策责任。',
]
for i in range(8):
    ans = answers[i % len(answers)]
    ev = sse(f'{API}/assessments/{aid}/chat/stream', st, {'content': ans})
    tag = ' '.join(e['event'] for e in ev)
    print(f'[提交{i+1}]', tag)
    if any(e['event'] == 'finished' for e in ev):
        print('  -> finished')
        break
    if not any(e['event'] in ('followup', 'question', 'finished') for e in ev):
        print('  事件详情:', [json.dumps(e, ensure_ascii=False)[:100] for e in ev])
        break

code, b = api('GET', f'/assessments/{aid}/result', token=st, uid=uid)
print('result HTTP', code, '| raw:', json.dumps(b, ensure_ascii=False)[:200])
snap = b.get('data') or b
dims = snap.get('dimensions') or []
before = snap.get('beforeDimensions') or []
tree = snap.get('skillTree') or []
advice = snap.get('advice') or ''
print('--- dimensions(%d) ---' % len(dims))
for dv in dims:
    print(' ', dv.get('dimension'), dv.get('score'), '| analysis:', (dv.get('analysis') or '')[:44])
print('--- beforeDimensions(%d) ---' % len(before))
for bv in before:
    print(' ', bv.get('dimension'), bv.get('score'))
print('--- skillTree(%d) ---' % len(tree))
for t in tree:
    print(' ', t.get('dimension'), '|', t.get('name'), t.get('score'), t.get('status'), t.get('lit'))
print('--- advice head ---', str(advice)[:70].replace('\n', ' '))
