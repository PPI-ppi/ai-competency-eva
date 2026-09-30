# -*- coding: utf-8 -*-
"""验证实操题附件：上传→提交带 artifactIds→DB 落库"""
import sys, io, json, time, requests, os, paramiko

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
            if not raw: continue
            if raw.startswith('event:'): ev = raw[6:].strip()
            elif raw.startswith('data:'):
                try: events.append({'event': ev, 'data': json.loads(raw[5:].strip())})
                except Exception: events.append({'event': ev, 'data': raw[5:].strip()})
    return events

# 教师建班 + 实操题
tacc = f'ar_t_{TS}'
api('POST', '/auth/register/teacher', json={'account': tacc, 'password': 'Smoke@12345', 'name': f'教{TS}', 'nickname': f't{TS}'})
_, b = api('POST', '/auth/login', json={'account': tacc, 'password': 'Smoke@12345', 'role': 'teacher'})
tt = b.get('data', {}).get('tokenValue') if isinstance(b, dict) else None
print('教师登录:', json.dumps(b, ensure_ascii=False)[:150] if isinstance(b, dict) else b)
code, b = api('POST', '/classes', token=tt, json={'name': f'附件验证{TS}', 'description': 'artifact', 'pointWeights': {'AI基本概念理解': 10}})
print('建班:', code, json.dumps(b, ensure_ascii=False)[:200] if isinstance(b, dict) else b)
cid = b.get('data', {}).get('id')
_, b = api('POST', '/questions', token=tt, json={
    'type': 'PRACTICAL', 'title': f'实操题{TS}', 'content': '请使用AI工具完成一个数据清洗任务，并提交你的成果文件与说明。',
    'options': '', 'answer': '', 'rubric': '评估学生对AI工具的使用熟练度与成果质量。',
    'difficulty': '3', 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解'], 'visibility': 'private',
    'artifactType': 'code', 'artifactRequirement': '请提交代码文件'})
qid = b['data']['id']
code, b = api('POST', f'/classes/{cid}/questions/{qid}', token=tt)
print('建班', cid, '建题', qid, '加题', code)

# 学生开题
sacc = f'ar_s_{TS}'
api('POST', '/auth/register/student', json={'account': sacc, 'password': 'Smoke@12345', 'name': f'学{TS}', 'nickname': f's{TS}'})
_, b = api('POST', '/auth/login', json={'account': sacc, 'password': 'Smoke@12345', 'role': 'student'})
st = b['data']['tokenValue']; uid = b['data']['user']['id']
_, b = api('POST', '/agent/engine/start', token=st, uid=uid, json={'classId': cid})
aid = b['data']['assessmentId']
_, b = api('POST', '/agent/engine/next-question', token=st, uid=uid, json={'assessmentId': aid})
q1 = (b['data'].get('question') or {})
print('开题 aid=', aid, '题id=', q1.get('id'))

# 上传附件（multipart）
files = {'file': ('clean.py', io.BytesIO('print("hello artifact")'.encode()), 'text/x-python')}
fd = {'assessmentId': str(aid), 'assessmentQuestionId': str(q1['id']), 'artifactType': 'code', 'codeLanguage': 'python'}
h = {'Authorization': st}
r = requests.post(API + '/agent/files', headers=h, data=fd, files=files, timeout=60)
up = r.json()
print('上传 ->', r.status_code, json.dumps(up, ensure_ascii=False)[:180])
aid2 = up.get('data', {}).get('artifactId')
if not aid2:
    print('上传失败'); sys.exit(1)

# 提交最终方案（带 artifactIds）
ev = sse(f'{API}/assessments/{aid}/chat/stream', st, {'content': '已完成清洗，代码见附件。', 'artifactIds': [aid2]})
print('提交事件:', ' '.join(e['event'] for e in ev))

# 查 DB 落库
import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.93.206', username='root', password=os.environ.get('SSHPASS'), timeout=30)
_, o, _ = c.exec_command("mysql -uroot ai_assessment -N -e \"SELECT a.artifact_ids FROM assessment_answers a JOIN assessment_questions q ON a.assessment_question_id=q.id WHERE q.assessment_id=%s AND q.question_id=%s\" " % (aid, q1['id']), timeout=60)
print('DB artifact_ids:', o.read().decode('utf-8', 'replace').strip() or '(空)')
_, o2, _ = c.exec_command("mysql -uroot ai_assessment -N -e \"SELECT id, file_name, file_url, artifact_type FROM assessment_artifacts WHERE assessment_id=%s\" " % aid, timeout=60)
print('artifacts 表:', o2.read().decode('utf-8', 'replace').strip() or '(空)')
c.close()
print('DONE')
