-- ============================================================
-- Organization point weights and fixed question score migration.
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE classes ADD COLUMN point_weights TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'classes'
  AND column_name = 'point_weights');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE questions SET score = 100 WHERE score IS NULL OR score <> 100;
ALTER TABLE questions MODIFY COLUMN score INT NOT NULL DEFAULT 100;

-- 自适应引擎 5.0 · 增量迁移（第 1 批）
-- 风格对齐 database.sql：幂等、无外键、utf8mb4、可重复执行
-- 本文件只增不改：新表 + 新列，不动现有列的数据与类型
-- ============================================================

-- ---------- 3.3.1 任务与测评增加权重与报告列 ----------
-- 教师发布任务时设定的考察点权重 JSON
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessment_tasks ADD COLUMN point_weights TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessment_tasks'
  AND column_name = 'point_weights');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 测评开始时从任务继承权重快照；自主练习为 NULL（等权 1.0）
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessments ADD COLUMN point_weights TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessments'
  AND column_name = 'point_weights');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 技能 4 产出的完整报告 JSON（overall/dimensions/suggestions）
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessments ADD COLUMN report_json TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessments'
  AND column_name = 'report_json');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3.3.2 本场考察点状态表（引擎状态容器） ----------
CREATE TABLE IF NOT EXISTS assessment_point_states (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  dimension VARCHAR(120) NOT NULL,
  assessment_point VARCHAR(160) NOT NULL,
  theta DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
  confidence DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
  -- 计答题计数：客观题 +0.5，实操/对话题 +1.0，追问 +0
  answer_count DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  question_count INT NOT NULL DEFAULT 0,
  follow_up_count INT NOT NULL DEFAULT 0,
  -- active 可考察 / converged 收敛(c>=0.75) / removed 计数3兜底剔除
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  last_difficulty DECIMAL(3,2) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_state_point(assessment_id, assessment_point),
  INDEX idx_states_assessment(assessment_id, status)
);

-- ---------- 3.3.3 发题快照与答案表扩展 ----------
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessment_questions ADD COLUMN point_name VARCHAR(160) NULL,
     ADD COLUMN dimension_name VARCHAR(120) NULL,
     ADD COLUMN difficulty_value DECIMAL(3,2) NULL,
     ADD COLUMN r_initial DECIMAL(6,4) NULL,
     ADD COLUMN r_final DECIMAL(6,4) NULL,
     ADD COLUMN signal_value DECIMAL(6,4) NULL,
     ADD COLUMN followed_up TINYINT(1) NOT NULL DEFAULT 0,
     ADD COLUMN follow_up_turns INT NOT NULL DEFAULT 0',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessment_questions'
  AND column_name = 'point_name');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 答案表增加清晰度字段（high/low），与实操成果关联（JSON 数组，一般 0/1 个）
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessment_answers ADD COLUMN clarity VARCHAR(8) NULL,
     ADD COLUMN artifact_ids TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessment_answers'
  AND column_name = 'clarity');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 维度/考察点聚合表增加文字点评列（技能 4 产出）
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessment_dimension_scores ADD COLUMN comment TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessment_dimension_scores'
  AND column_name = 'comment');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE assessment_point_scores ADD COLUMN comment TEXT NULL,
     ADD COLUMN verdict VARCHAR(16) NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'assessment_point_scores'
  AND column_name = 'comment');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3.2 题型扩展：questions 表增加实操成果字段 ----------
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE questions ADD COLUMN artifact_type VARCHAR(16) NULL,
     ADD COLUMN artifact_requirement TEXT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'questions'
  AND column_name = 'artifact_type');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3.2.1 题库分类（AI 变题功能）：test=测试题库 / training=训练题库 ----------
-- 组织分类题库按 class_questions + question_kind 过滤；缺列时管理端题库查询会报
-- Unknown column 'question_kind'，全新库与老库都要保证存在。
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE questions ADD COLUMN question_kind VARCHAR(16) NOT NULL DEFAULT ''test''',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'questions'
  AND column_name = 'question_kind');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- AI 变体题标记来源题目；非变体为 NULL。前端训练题库用它标记「该题已生成过变体」。
SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE questions ADD COLUMN source_question_id BIGINT NULL',
    'DO 0')
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'questions'
  AND column_name = 'source_question_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE questions ADD INDEX idx_questions_kind_status(question_kind, status)',
    'DO 0')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'questions'
  AND index_name = 'idx_questions_kind_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3.3.4 班级题目新鲜度表 ----------
CREATE TABLE IF NOT EXISTS class_question_freshness (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  freshness DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  draw_count INT NOT NULL DEFAULT 0,
  last_drawn_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_class_question_fresh(class_id, question_id)
);

-- ---------- 3.3.5 学生考察点画像表 ----------
CREATE TABLE IF NOT EXISTS student_point_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  dimension VARCHAR(120) NOT NULL,
  assessment_point VARCHAR(160) NOT NULL,
  -- 幂等维护：profile_sum 与 profile_weight 两个数，不重算历史
  profile_sum DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  profile_weight DECIMAL(12,6) NOT NULL DEFAULT 0.000000,
  profile_value DECIMAL(6,4) NOT NULL DEFAULT 0.0000,
  last_updated_at DATE NULL,
  -- 幂等：最近一次入账的测评，防止收尾接口重复调用
  last_assessment_id BIGINT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_profile_point(class_id, student_user_id, assessment_point),
  INDEX idx_profile_student(student_user_id, class_id)
);

-- ---------- 3.3.6 实操成果表与引擎日志表 ----------
CREATE TABLE IF NOT EXISTS assessment_artifacts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  assessment_question_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  artifact_type VARCHAR(16) NOT NULL,
  file_name VARCHAR(255) NULL,
  file_url VARCHAR(500) NULL,
  code_language VARCHAR(32) NULL,
  run_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  run_result TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_artifact_question(assessment_question_id, artifact_type),
  INDEX idx_artifacts_assessment(assessment_id)
);

CREATE TABLE IF NOT EXISTS assessment_engine_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  event VARCHAR(32) NOT NULL,
  assessment_point VARCHAR(160) NULL,
  payload TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_engine_log_assessment(assessment_id, id)
);
