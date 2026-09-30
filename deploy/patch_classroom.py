# -*- coding: utf-8 -*-
import io
p = r"C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\controller\ClassRoomController.java"
s = io.open(p, encoding='utf-8').read()

old = """    public record Create(@NotBlank String name, String description, Map<String, Integer> pointWeights) {}

    @PostMapping
    public ApiResponse<?> create(@Valid @RequestBody Create request) {
        Long userId = uid();
        if (!teachers.existsByUserId(userId)) throw new BusinessException("只有教师可以创建班级");
        validatePointWeights(request.pointWeights());
        ClassRoom classroom = new ClassRoom(userId, request.name(), request.description());
        classroom.setPointWeights(writePointWeights(request.pointWeights()));
        ClassRoom saved = classes.save(classroom);
        ClassInviteCode inviteCode = newInviteCode(saved.getId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("name", saved.getName());
        result.put("description", Optional.ofNullable(saved.getDescription()).orElse(""));
        result.put("pointWeights", request.pointWeights());
        result.put("inviteCode", inviteCode.getCode());
        return ApiResponse.ok(result);
    }
"""
new = """    public record Create(@NotBlank String name, String description, Map<String, Integer> pointWeights,
                         List<Map<String, Object>> assessmentPointWeights) {}

    @PostMapping
    public ApiResponse<?> create(@Valid @RequestBody Create request) {
        Long userId = uid();
        if (!teachers.existsByUserId(userId)) throw new BusinessException("只有教师可以创建班级");
        Map<String, Integer> weights = resolveCreateWeights(request);
        validatePointWeights(weights);
        ClassRoom classroom = new ClassRoom(userId, request.name(), request.description());
        classroom.setPointWeights(writePointWeights(weights));
        ClassRoom saved = classes.save(classroom);
        ClassInviteCode inviteCode = newInviteCode(saved.getId());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", saved.getId());
        result.put("name", saved.getName());
        result.put("description", Optional.ofNullable(saved.getDescription()).orElse(""));
        result.put("pointWeights", weights);
        result.put("inviteCode", inviteCode.getCode());
        return ApiResponse.ok(result);
    }

    /**
     * 兼容两种创建组织契约：
     *  - 仓库前端/老契约：pointWeights（Map<考察点, 0-10整数>）
     *  - v9 前端：assessmentPointWeights（[{dimension, assessmentPoint, weight: 0-1小数}]，百分比合计100换算成0-10整数）
     */
    private Map<String, Integer> resolveCreateWeights(Create request) {
        Map<String, Integer> weights = new LinkedHashMap<>();
        if (request.pointWeights() != null) weights.putAll(request.pointWeights());
        if (request.assessmentPointWeights() != null) {
            for (Map<String, Object> item : request.assessmentPointWeights()) {
                Object pointObj = item.get("assessmentPoint");
                Object weightObj = item.get("weight");
                if (pointObj == null || weightObj == null) continue;
                String point = String.valueOf(pointObj).trim();
                double w = Double.parseDouble(String.valueOf(weightObj));
                weights.put(point, (int) Math.round(w * 10));
            }
        }
        return weights;
    }
"""
assert old in s, "old block not found"
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("patched OK")
