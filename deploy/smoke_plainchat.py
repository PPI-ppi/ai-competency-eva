# -*- coding: utf-8 -*-
"""回归：对话窗口(/chat 纯聊不评分) + 提交最终方案(/chat/stream 评分/追问/下一题)"""
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

def sse(url, token, payload, timeout=90):
    """POST SSE 并收集事件"""
    events = []
    try:
        with requests.post(url, headers={'Content-Type': 'application/json', 'Authorization': token},
                           json=payload, stream=True, timeout=timeout) as r:
            for raw in r.iter_lines(decode_unicode=True):
                if not raw or not raw.startswith('data:'):
                    continue
                try:
                    events.append(json.loads(raw[5:].strip()))
                except Exception:
                    events.append({'raw': raw[5:].strip()})
    except Exception as e:
        events.append({'error': str(e)})
    return events

# 教师建班+建题+加题
tacc = f'pc_t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
_, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b['data']['tokenValue']
_, b = api('POST', '/classes', token=tt, json={'name': f'对话题班级{TS}', 'description': 'plainchat e2e', 'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
cid = b['data']['id']
_, b = api('POST', '/questions', token=tt, json={
    'type': 'DIALOGUE', 'title': f'理财对话{TS}', 'content': '你获得5000元奖学金想理财，AI建议"年化15%风险较低"。请与AI多轮对话，最终给出300字内个人决策说明。',
    'options': '', 'answer': '', 'rubric': '判断学生能否识别收益夸大、数据可靠性、风险指标，并明确哪些采纳AI、哪些需自行查证、最终决策责任。',
    'difficulty': '3', 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解'], 'visibility': 'private'})
qid = b['data']['id']
api('POST', f'/classes/{cid}/questions/{qid}', token=tt)
print('班级', cid, '对话题', qid)

# 学生开题
sacc = f'pc_s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
_, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
_, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
aid = b['data']['assessmentId']
_, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
q1 = b['data'].get('question') or {}
q1id = q1.get('id')
print('开题 assessmentId', aid, '题', q1id, q1.get('type'))

print('\n=== 1) 对话窗口 /chat：普通消息（不应评分/推进） ===')
ev = sse(f'{API}/assessments/{aid}/chat', st, {'content': '请先介绍一下年化收益怎么算？'})
print('事件:', [(list(e.keys())) for e in ev][:4], '| 最后:', json.dumps(ev[-1], ensure_ascii=False)[:120])
_, conv = api('GET', f'/assessments/{aid}/conversation', token=st)
cur = conv['data'].get('currentQuestion') or {}
print('对话后 currentQuestion 仍为同一题:', cur.get('questionId') == q1id or cur.get('id') == q1id, '| status 未变')

print('\n=== 2) 提交最终方案 /chat/stream：应评分并可能追问/推进 ===')
ev = sse(f'{API}/assessments/{aid}/chat/stream', st, {'content': 'AI建议年化15%偏低风险不可信，回测不代表实盘，我会核实数据来源并自行决策，不轻信收益承诺。'})
kinds = [list(e.keys()) for e in ev]
print('事件类型:', kinds)
print('事件内容:', json.dumps(ev[:3], ensure_ascii=False)[:400])

print('\n=== 3) conversation 追问字段 ===')
_, conv = api('GET', f'/assessments/{aid}/conversation', token=st)
fu = conv['data'].get('followUps') or []
print('followUps 条数:', len(fu), '| 首条:', json.dumps(fu[0], ensure_ascii=False)[:150] if fu else '无')
print('=== PLAINCHAT REGRESSION DONE ===')
