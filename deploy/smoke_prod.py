# -*- coding: utf-8 -*-
"""生产端到端冒烟：完整走一遍测评流程，验证 v9 无 action 提交 → 下一题/追问"""
import sys, io, json, time, uuid, requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
BASE = 'http://120.26.93.206/api'
TS = str(int(time.time()))[-8:]
TEACHER = f'smoke_t_{TS}'
STUDENT = f'smoke_s_{TS}'
PW = 'Smoke@12345'

def api(method, path, token=None, **kw):
    h = {'Content-Type': 'application/json'}
    if token:
        h['Authorization'] = token
    r = requests.request(method, BASE + path, headers=h, timeout=90, **kw)
    body = None
    try:
        body = r.json()
    except Exception:
        body = r.text[:300]
    return r.status_code, body

def ok(name, code, body, expect=200):
    mark = 'OK ' if code == expect else 'FAIL'
    print(f"[{mark}] {name} -> {code}")
    if code != expect:
        print('   body:', json.dumps(body, ensure_ascii=False)[:400])
    return code == expect

def main():
    # 1. 注册教师
    code, body = api('POST', '/auth/register/teacher', json={
        'account': TEACHER, 'password': PW, 'name': f'冒烟教师{TS}', 'nickname': f'教师{TS}'})
    if not ok('注册教师', code, body): return
    # 2. 登录教师
    code, body = api('POST', '/auth/login', json={'account': TEACHER, 'password': PW, 'role': 'teacher'})
    if not ok('登录教师', code, body): return
    tt = body['data']['tokenValue']
    # 3. 创建组织
    code, body = api('POST', '/classes', token=tt, json={
        'name': f'冒烟测试班级{TS}', 'description': '端到端冒烟',
        'pointWeights': {'AI基本概念理解': 6, '提示词书写': 4}})
    if not ok('创建组织', code, body): return
    class_id = body['data']['id']
    # 4. 建题：客观题 + 对话题
    q1 = {
        'type': 'SINGLE_CHOICE', 'title': f'冒烟单选题{TS}', 'content': '1+1=?',
        'options': json.dumps(['A. 2', 'B. 3', 'C. 4', 'D. 5'], ensure_ascii=False),
        'answer': 'A', 'rubric': '基本算术', 'difficulty': 1,
        'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解']}
    q2 = {
        'type': 'DIALOGUE', 'title': f'冒烟对话题{TS}', 'content': '请说说你对递归的理解',
        'options': None, 'answer': None, 'rubric': '能说出递归定义与终止条件',
        'difficulty': 2, 'tags': ['AI基础认知'], 'assessmentPoints': ['AI基本概念理解']}
    ids = []
    for q in (q1, q2):
        code, body = api('POST', '/questions', token=tt, json=q)
        if not ok(f'建题 {q["type"]}', code, body): return
        ids.append(body['data']['id'])
    # 5. 加题入班（会同步生成 AI 训练变体，可能较慢）
    for qid in ids:
        code, body = api('POST', f'/classes/{class_id}/questions/{qid}', token=tt, json={})
        ok(f'加题入班 q{qid}', code, body)
    # 6. 发布任务（2 题）
    code, body = api('POST', f'/classes/{class_id}/assessment-tasks', token=tt, json={
        'title': f'冒烟任务{TS}', 'description': '端到端', 'questionCount': 2, 'estimatedDuration': 10})
    if not ok('发布任务', code, body): return
    task_id = body['data']['id']
    # 7. 注册学生 + 登录
    code, body = api('POST', '/auth/register/student', json={
        'account': STUDENT, 'password': PW, 'name': f'冒烟学生{TS}', 'nickname': f'学生{TS}'})
    if not ok('注册学生', code, body): return
    code, body = api('POST', '/auth/login', json={'account': STUDENT, 'password': PW, 'role': 'student'})
    if not ok('登录学生', code, body): return
    st = body['data']['tokenValue']
    # 8. 拿邀请码 + 加入班级
    code, body = api('POST', f'/classes/{class_id}/invite-code', token=tt, json={})
    if not ok('刷新邀请码', code, body): return
    invite = body['data']['code']
    code, body = api('POST', '/classes/join', token=st, json={'inviteCode': invite})
    if not ok('学生加入班级', code, body): return
    # 9. 学生开始任务
    code, body = api('POST', f'/assessment-tasks/{task_id}/start', token=st, json={})
    if not ok('学生开始任务', code, body): return
    aid = body['data']['assessment']['id'] if isinstance(body.get('data'), dict) and 'assessment' in body.get('data', {}) else body['data']['id']
    print('   assessmentId =', aid)
    # 10. 拉对话现场
    code, body = api('GET', f'/assessments/{aid}/conversation', token=st)
    ok('conversation 拉取', code, body)
    conv = body.get('data', {}) if code == 200 else {}
    q = conv.get('question') or conv.get('currentQuestion')
    print('   currentQuestion:', None if not q else {k: q.get(k) for k in ('id', 'type', 'content')})
    print('   questions 数组条数:', len(conv.get('questions') or []))

    def sse_send(payload, label, raw_dump=False):
        h = {'Content-Type': 'application/json', 'Authorization': st}
        with requests.post(BASE + f'/assessments/{aid}/chat/stream', headers=h,
                           json=payload, stream=True, timeout=120) as r:
            print(f'--- {label} HTTP {r.status_code} ---')
            lines = []
            for line in r.iter_lines(decode_unicode=True):
                lines.append(line)
                if raw_dump:
                    print('   RAW:', line[:300])
            return lines

    # 10.5 开题：模拟 v9 初次加载发空 content
    if not q:
        raw = sse_send({'content': ''}, '开题(空content)', raw_dump=True)
        time.sleep(1)
        code, body = api('GET', f'/assessments/{aid}/conversation', token=st)
        conv = body.get('data', {}) if code == 200 else {}
        q = conv.get('question') or conv.get('currentQuestion')
        print('   [开题后] currentQuestion:', None if not q else {k: q.get(k) for k in ('id', 'type', 'content')})
        if not q:
            print('   开题后仍无当前题，终止'); return
    # 11. 模拟 v9：不带 action 提交答案（客观题发选项全文）
    if q.get('type') in ('SINGLE_CHOICE', 'TRUE_FALSE', 'SINGLE'):
        answer_payload = 'A. 2'
    else:
        answer_payload = '我认为递归是函数调用自身并设置终止条件'
    raw = sse_send({'content': answer_payload}, f'提交答案(无action): {answer_payload!r}', raw_dump=True)
    # 12. 提交后再拉 conversation，看左栏数据
    time.sleep(2)
    code, body = api('GET', f'/assessments/{aid}/conversation', token=st)
    conv = body.get('data', {}) if code == 200 else {}
    q = conv.get('question') or conv.get('currentQuestion')
    print('   [提交后] currentQuestion:', None if not q else {k: q.get(k) for k in ('id', 'type', 'status')})
    print('   [提交后] questions 数组:', [
        {k: it.get(k) for k in ('id', 'type', 'status', 'answered', 'completed')} for it in (conv.get('questions') or [])])
    print('   [提交后] followUps 条数:', len(conv.get('followUps') or []))
    for fu in (conv.get('followUps') or [])[:3]:
        print('     追问:', str(fu.get('content'))[:80])

    # 13. 对话题链路：初答 → (追问) → 下一题/收尾
    print('\n--- 对话题链路 ---')
    if q and q.get('type') == 'DIALOGUE' and q.get('status') == 'sent':
        lines = sse_send({'content': '我认为递归是函数调用自身，需要设置终止条件避免无限循环'},
                         '对话题提交初答(无action)', raw_dump=True)
        has_followup = any('followup' in ln for ln in lines)
        if has_followup:
            print('   >>> 收到追问，继续作答')
            lines2 = sse_send({'content': '递归必须有基线条件结束递归，否则会栈溢出'},
                              '提交追问答案(无action)', raw_dump=True)
    elif q is None:
        print('   测评已结束/无当前题')
    # 14. 最终状态
    time.sleep(2)
    code, body = api('GET', f'/assessments/{aid}/conversation', token=st)
    conv = body.get('data', {}) if code == 200 else {}
    print('   [最终] questions:', [
        {k: it.get(k) for k in ('id', 'type', 'status', 'answered', 'completed')} for it in (conv.get('questions') or [])])
    print('   [最终] followUps:', [
        str(fu.get('content'))[:60] for fu in (conv.get('followUps') or [])])
    print('   [最终] status:', conv.get('status'))
    print('\n=== SMOKE DONE ===')

if __name__ == '__main__':
    main()
