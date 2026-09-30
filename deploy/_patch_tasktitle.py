# -*- coding: utf-8 -*-
"""后端：/api/reports 与 /api/assessments/results/history 填充 taskTitle（学生端任务报告行显示任务名）"""
import io, sys
p = r'C:\Users\LWH\Doubao\chats\2026-09-19\new-chat\repos\ai-competency-eva-fresh\backend-java\src\main\java\com\huiqiyikang\assessment\controller\AssessmentCompatController.java'
s = io.open(p, encoding='utf-8').read()

# 1) history 填充
old1 = """    @GetMapping("/assessments/results/history")
    public ApiResponse<?> history() {
        return ApiResponse.ok(assessments.findByStudentUserIdOrderByCreatedAtDesc(uid()));
    }"""
new1 = """    @GetMapping("/assessments/results/history")
    public ApiResponse<?> history() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        fillTaskTitles(rows);
        return ApiResponse.ok(rows);
    }"""
assert s.count(old1) == 1, f'history count={s.count(old1)}'
s = s.replace(old1, new1)

# 2) reports 填充
old2 = """    @GetMapping("/reports")
    public ApiResponse<?> reports() {
        return ApiResponse.ok(assessments.findByStudentUserIdOrderByCreatedAtDesc(uid()));
    }"""
new2 = """    @GetMapping("/reports")
    public ApiResponse<?> reports() {
        List<Assessment> rows = assessments.findByStudentUserIdOrderByCreatedAtDesc(uid());
        fillTaskTitles(rows);
        return ApiResponse.ok(rows);
    }"""
assert s.count(old2) == 1, f'reports count={s.count(old2)}'
s = s.replace(old2, new2)

# 3) 新增 fillTaskTitles 方法（放在 str 辅助方法前）
old3 = """    private Long uid() { return StpUtil.getLoginIdAsLong(); }
    private String str(Object o) { return o == null ? null : String.valueOf(o); }
}"""
new3 = """    private Long uid() { return StpUtil.getLoginIdAsLong(); }
    private String str(Object o) { return o == null ? null : String.valueOf(o); }

    /** 列表接口给任务测评填充任务标题（Assessment.taskTitle 为非库列字段，前端报告行展示用）。 */
    private void fillTaskTitles(List<Assessment> rows) {
        List<Long> taskIds = rows.stream().map(Assessment::getTaskId).filter(Objects::nonNull).distinct().toList();
        if (taskIds.isEmpty()) return;
        Map<Long, String> titles = taskRepo.findAllById(taskIds).stream()
                .collect(Collectors.toMap(AssessmentTask::getId, AssessmentTask::getTitle, (a, b) -> a));
        for (Assessment r : rows) {
            if (r.getTaskId() != null) r.setTaskTitle(titles.get(r.getTaskId()));
        }
    }
}"""
assert s.count(old3) == 1, f'uid helper count={s.count(old3)}'
s = s.replace(old3, new3)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('后端已改：reports/history 填充 taskTitle')
