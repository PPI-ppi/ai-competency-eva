# -*- coding: utf-8 -*-
import io, sys
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\frontend-v9\src\main.jsx'
s = io.open(p, encoding='utf-8').read()
i = s.find('adviceParsed.dimensions&&')
print(repr(s[i-30:i+30]))
print('---')
print(repr(s[i+30:i+120]))
