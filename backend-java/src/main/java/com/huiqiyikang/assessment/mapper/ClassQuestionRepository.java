package com.huiqiyikang.assessment.mapper; import com.huiqiyikang.assessment.entity.ClassQuestion; import com.huiqiyikang.assessment.entity.Question; import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper; import java.util.*;
public interface ClassQuestionRepository extends BaseMapperX<ClassQuestion>{default Optional<ClassQuestion> findByClassIdAndQuestionId(Long classId,Long questionId){return Optional.ofNullable(selectOne(new QueryWrapper<ClassQuestion>().eq("class_id",classId).eq("question_id",questionId)));} default List<ClassQuestion> findByClassIdAndStatus(Long classId,String status){return selectList(new QueryWrapper<ClassQuestion>().eq("class_id",classId).eq("status",status));}
 default long countByClassIdAndStatus(Long classId,String status){return selectCount(new QueryWrapper<ClassQuestion>().eq("class_id",classId).eq("status",status));}
 @org.apache.ibatis.annotations.Select("SELECT * FROM class_questions WHERE class_id=#{classId} AND question_id=#{questionId} FOR UPDATE")
 ClassQuestion lockSource(@org.apache.ibatis.annotations.Param("classId") Long classId,@org.apache.ibatis.annotations.Param("questionId") Long questionId);
 @org.apache.ibatis.annotations.Select("SELECT q.* FROM questions q JOIN class_questions cq ON cq.question_id=q.id WHERE cq.class_id=#{classId} AND q.source_question_id=#{sourceId} AND q.question_kind='training' AND q.status='active' ORDER BY (cq.status='active') DESC,q.id ASC LIMIT 1")
 Question findTrainingVariant(@org.apache.ibatis.annotations.Param("classId") Long classId,@org.apache.ibatis.annotations.Param("sourceId") Long sourceId);
 @org.apache.ibatis.annotations.Select("SELECT COUNT(*) FROM class_questions cq JOIN questions q ON q.id=cq.question_id WHERE cq.class_id=#{classId} AND cq.status='active' AND q.status='active' AND COALESCE(q.question_kind,'test')='test'")
 long countActiveTestQuestions(@org.apache.ibatis.annotations.Param("classId") Long classId);
}
