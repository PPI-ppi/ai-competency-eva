package com.huiqiyikang.assessment.mapper; import com.huiqiyikang.assessment.entity.Assessment; import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper; import java.util.*; public interface AssessmentRepository extends BaseMapperX<Assessment>{
 // 已完成的测评状态；带评分失败也算完成，分数只按评分成功的题目算。
 List<String> COMPLETED_STATUSES = List.of("completed", "completed_with_scoring_failure");
 // LIMIT 1 keeps this working on databases that still carry duplicate sessions created before the reuse rule existed.
 default Optional<Assessment> findByTaskIdAndStudentUserId(Long taskId,Long userId){return newest(new QueryWrapper<Assessment>().eq("task_id",taskId).eq("student_user_id",userId));}
 default Optional<Assessment> newest(QueryWrapper<Assessment> query){return selectList(query.orderByDesc("created_at").orderByDesc("id").last("LIMIT 1")).stream().findFirst();}
 default List<Assessment> findByStudentUserIdOrderByCreatedAtDesc(Long userId){return selectList(new QueryWrapper<Assessment>().eq("student_user_id",userId).orderByDesc("created_at"));}
 /** 班级隔离：只返回该学生在指定班级下的测评记录。 */
 default List<Assessment> findByStudentUserIdAndClassIdOrderByCreatedAtDesc(Long userId,Long classId){return selectList(new QueryWrapper<Assessment>().eq("student_user_id",userId).eq("class_id",classId).orderByDesc("created_at"));}
 /** 该学生在指定班级下最新一次已完成的测评（班级分数与等级的来源）。 */
 default Optional<Assessment> findLatestCompleted(Long classId,Long userId){return selectList(new QueryWrapper<Assessment>().eq("class_id",classId).eq("student_user_id",userId).in("status",COMPLETED_STATUSES).orderByDesc("completed_at").orderByDesc("id").last("LIMIT 1")).stream().findFirst();}
 /** 该学生在指定班级下最近 N 次已完成的测评，倒序（趋势曲线用）。 */
 default List<Assessment> findRecentCompleted(Long classId,Long userId,int limit){return selectList(new QueryWrapper<Assessment>().eq("class_id",classId).eq("student_user_id",userId).in("status",COMPLETED_STATUSES).orderByDesc("completed_at").orderByDesc("id").last("LIMIT " + Math.max(1, limit)));}
 /** 一次取一个任务（或一组任务）下的全部测评，替代调用方把整张表读进内存再过滤。 */
 default List<Assessment> findByTaskIdIn(Collection<Long> taskIds){return taskIds==null||taskIds.isEmpty()?List.of():selectList(new QueryWrapper<Assessment>().in("task_id",taskIds));}
 default List<Assessment> findByStudentUserId(Long userId){return selectList(new QueryWrapper<Assessment>().eq("student_user_id",userId));}
 default List<Assessment> findByClassIdAndStatus(Long classId,String status){return selectList(new QueryWrapper<Assessment>().eq("class_id",classId).eq("status",status));}
}
