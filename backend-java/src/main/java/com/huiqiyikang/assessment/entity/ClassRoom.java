package com.huiqiyikang.assessment.entity;

import com.baomidou.mybatisplus.annotation.*; import lombok.*; import java.time.Instant;
@TableName("classes") @Getter @Setter @NoArgsConstructor
public class ClassRoom {
    @TableId(type=IdType.AUTO) Long id;
    Long teacherUserId;
    String name;
    String description;
    String pointWeights;
    Instant createdAt=Instant.now();
    Instant updatedAt=Instant.now();
    public ClassRoom(Long teacherUserId,String name,String description){
        this.teacherUserId=teacherUserId;
        this.name=name;
        this.description=description;
    }
}
