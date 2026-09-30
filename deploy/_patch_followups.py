# -*- coding: utf-8 -*-
"""后端：followUps 改为跳过「内容等于题干」的消息（i 从 0 开始），确保追问总能显示"""
import io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\service\AssessmentAgentService.java"
s = io.open(P, encoding='utf-8').read()

old = '''        for (int i = 1; i < ais.size(); i++) {
            AssessmentMessage ai = ais.get(i);
            // 老数据可能没写题干消息；兜底：内容与题面相同的 AI 消息视为题干，不算追问
            if (Objects.equals(ai.getContent(), question.getContentSnapshot())) continue;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", ai.getId());
            view.put("content", ai.getContent());
            out.add(view);
        }'''
assert s.count(old) == 1, f'count {s.count(old)}'
new = '''        for (int i = 0; i < ais.size(); i++) {
            AssessmentMessage ai = ais.get(i);
            // 题干消息（内容与题面相同）不算追问；没有题干消息时第一条 ai 消息就是追问，要保留
            if (Objects.equals(ai.getContent(), question.getContentSnapshot())) continue;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("id", ai.getId());
            view.put("content", ai.getContent());
            out.add(view);
        }'''
s2 = s.replace(old, new, 1)
io.open(P, 'w', encoding='utf-8', newline='').write(s2)
print('followUps fixed:', len(s2) - len(s), 'bytes')
print('OK')
