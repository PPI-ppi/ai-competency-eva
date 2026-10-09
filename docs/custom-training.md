# 自定义训练

本需求分支为 `feat/v9-custom-training`，依赖 `fix/organization-question-bank-isolation`。

学生在当前组织中选择能力维度、考察点、训练模式、可选难度和题量上限。后端校验有效组织成员、维度与考察点分类，并检查组织训练题库是否覆盖所选范围。训练只抽取当前组织的有效训练变体；指定难度时严格匹配，未指定时自动匹配。

新增 `POST /api/training/start`，会话继续使用现有测评/评分接口。配置存入 `assessments.training_config`，正式测评保持使用原题。上线前在已有数据库执行 `backend-java/src/main/resources/db/migration/02_custom_training.sql`；全新数据库使用 `database.sql`。两者均支持重复执行，不删除旧数据。

组织训练题库为空或缺少所选模式/难度的题目时，页面明确提示，保留选择供调整。需要先由管理员加入原题并生成训练变体。
