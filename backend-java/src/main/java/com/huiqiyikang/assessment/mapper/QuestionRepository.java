package com.huiqiyikang.assessment.mapper;
import com.huiqiyikang.assessment.entity.Question;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper; import java.util.List;
public interface QuestionRepository extends BaseMapperX<Question>{default List<Question> findByOwnerUserIdAndStatus(Long owner,String status){return selectList(new QueryWrapper<Question>().eq("owner_user_id",owner).eq("status",status));} default List<Question> findByVisibilityAndStatus(String visibility,String status){return selectList(new QueryWrapper<Question>().eq("visibility",visibility).eq("status",status));} default List<Question> findByQuestionKindAndStatus(String kind,String status){return selectList(new QueryWrapper<Question>().eq("question_kind",kind).eq("status",status));} }
