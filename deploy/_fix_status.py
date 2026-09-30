# -*- coding: utf-8 -*-
import io
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\service\AssessmentAgentService.java'
s = io.open(p, encoding='utf-8').read()
old = '''                status = "active".equals(p.status())
                        ? (lit || (score != null && score >= 75) ? "mastered"
                            : (score != null && score > 0 ? "learning" : "locked"))
                        : "locked";'''
new = '''                status = (lit || (score != null && score >= 75)) ? "mastered"
                        : (score != null && score > 0 ? "learning" : "locked");'''
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('replaced OK')
