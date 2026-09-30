# -*- coding: utf-8 -*-
import io
p = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\service\EngineService.java"
s = io.open(p, encoding='utf-8').read()
old = """        if (result.isEmpty()) {
            // 兜底：取班级里权重最高的考察点
            result.add(new PointWeight("提示词书写", "提示词工程", 1.0));
        }
        return result;
    }"""
new = """        if (result.isEmpty()) {
            // 未指定考察点：回退班级配置的考察范围（教师建班时设定的权重），
            // 保证引擎选点能匹配班级题库里的题目，而不是凭空取一个考察点后无题可出。
            List<PointWeight> fromClass = new ArrayList<>();
            for (Map.Entry<String, Double> e : loadClassWeights(a.getClassId()).entrySet()) {
                fromClass.add(new PointWeight(e.getKey(), guessDimension(e.getKey()), e.getValue()));
            }
            if (!fromClass.isEmpty()) return fromClass;
            // 最后兜底：至少保证一个可考的点，避免引擎无可考察点直接收尾。
            result.add(new PointWeight("提示词书写", "提示词工程", 1.0));
        }
        return result;
    }"""
assert old in s, "old block not found"
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("patched OK")
