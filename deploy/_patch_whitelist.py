# -*- coding: utf-8 -*-
"""前端白名单 zip-backend-routes.json：加入 POST /api/assessments/{id}/chat"""
import io, json, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
P = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\api\zip-backend-routes.json"
data = json.load(io.open(P, encoding='utf-8'))
new = {"method": "POST", "path": "/api/assessments/{id}/chat", "source": "AssessmentController.java"}
if new not in data:
    data.append(new)
    io.open(P, 'w', encoding='utf-8', newline='').write(json.dumps(data, ensure_ascii=False, indent=2))
    print('白名单新增 /api/assessments/{id}/chat，共', len(data), '条')
else:
    print('已存在，共', len(data), '条')
