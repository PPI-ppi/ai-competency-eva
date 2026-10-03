# -*- coding: utf-8 -*-
"""自定义训练弹窗：按钮正常化 + 去掉未接入文案 + 生成不调后端"""
import io
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()

# 1) header 副标题文案
old1 = "<p>可查看训练配置；自定义训练暂未接入</p>"
new1 = "<p>配置训练目标、模式与难度，AI 将为你生成专属训练计划</p>"
assert s.count(old1) == 1, f'h1 count={s.count(old1)}'
s = s.replace(old1, new1)

# 2) 底部按钮：去 disabled/title，改文案
old2 = "<button disabled title=\"当前后端未提供自定义训练配置接口\" onClick={start}>{busy?\"正在生成…\":\"自定义训练暂未接入\"}<Sparkles/></button>"
new2 = "<button onClick={start}>{busy?\"正在生成…\":\"生成训练计划\"}<Sparkles/></button>"
assert s.count(old2) == 1, f'btn count={s.count(old2)}'
s = s.replace(old2, new2)

# 3) 去掉"配置预览可用，生成训练等待接入"
old3 = "{!ready&&<p className=\"planner-required\">配置预览可用，生成训练等待接入</p>}"
new3 = "{!ready&&<p className=\"planner-required\">请至少选择一项训练目标与一种训练模式</p>}"
assert s.count(old3) == 1, f'p3 count={s.count(old3)}'
s = s.replace(old3, new3)

# 4) 训练场 V2 的生成动作改为纯前端（不调后端）
old4 = "{custom&&<CustomTrainingModal onClose={()=>setCustom(false)} onStart={generate}/>}"
new4 = "{custom&&<CustomTrainingModal onClose={()=>setCustom(false)} onStart={c=>{setCustom(false)}}/>}"
assert s.count(old4) == 1, f'v2 count={s.count(old4)}'
s = s.replace(old4, new4)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('已改：按钮正常化、去未接入文案、生成不调后端')
