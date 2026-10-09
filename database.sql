-- AI 能力测评系统开发库
-- 用法：mysql -uroot -p < database.sql
-- 本文件只负责建表，不使用外键约束；业务关联由 Java 代码维护。

CREATE DATABASE IF NOT EXISTS ai_assessment
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE ai_assessment;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(80) NOT NULL,
  nickname VARCHAR(80),
  -- 注册时选填的联系方式（手机号 11 位、邮箱），个人中心可修改
  phone VARCHAR(32),
  email VARCHAR(160),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS students (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS teachers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  owner_user_id BIGINT NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  options TEXT,
  answer TEXT,
  rubric TEXT,
  tags TEXT,
  assessment_points TEXT,
  difficulty INT NOT NULL DEFAULT 1,
  score INT NOT NULL DEFAULT 100,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private',
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  -- 题库分类：test=测试题库 / training=训练题库（AI 变体），组织分类题库按此列过滤
  question_kind VARCHAR(16) NOT NULL DEFAULT 'test',
  -- AI 变体题标记来源题目；非变体为 NULL
  source_question_id BIGINT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_questions_owner_status(owner_user_id, status),
  -- 公共题库列表：WHERE visibility=? AND status=?
  INDEX idx_questions_visibility_status(visibility, status),
  INDEX idx_questions_kind_status(question_kind, status)
);

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  point_weights TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_classes_teacher(teacher_user_id)
);

CREATE TABLE IF NOT EXISTS class_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  left_at TIMESTAMP(3),
  removed_at TIMESTAMP(3),
  UNIQUE KEY uk_class_student(class_id, student_user_id),
  -- 学生端「我的班级」：WHERE student_user_id=? AND status=?（uk 以 class_id 打头，用不上）
  INDEX idx_members_student_status(student_user_id, status)
);

CREATE TABLE IF NOT EXISTS class_invite_codes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  code VARCHAR(12) NOT NULL UNIQUE,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  invalidated_at TIMESTAMP(3),
  INDEX idx_invite_class_status(class_id, status)
);

CREATE TABLE IF NOT EXISTS class_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  added_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  removed_at TIMESTAMP(3),
  UNIQUE KEY uk_class_question(class_id, question_id)
);

CREATE TABLE IF NOT EXISTS assessment_tasks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  teacher_user_id BIGINT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  estimated_duration INT,
  question_count INT NOT NULL DEFAULT 10,
  -- 教师发布任务时选定的考察范围（固定枚举值），学生开始该任务时继承
  dimensions TEXT,
  assessment_points TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_tasks_class_status(class_id, status)
);

CREATE TABLE IF NOT EXISTS assessments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  task_id BIGINT NULL,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  -- 本次测评的考察范围：任务型测评继承任务，自主测评由学生选择
  dimensions TEXT,
  assessment_points TEXT,
  question_count INT NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMP(3),
  total_score DECIMAL(6,2),
  average_score DECIMAL(6,2),
  ability_level VARCHAR(4),
  advice TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_assessments_student_status(student_user_id, status),
  INDEX idx_assessments_class(class_id),
  -- 能力画像：WHERE class_id=? AND student_user_id=? AND status IN (...) ORDER BY completed_at DESC
  INDEX idx_assessments_class_student(class_id, student_user_id, status),
  UNIQUE KEY uk_assessment_task_student(task_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  question_id BIGINT NOT NULL,
  sequence_no INT NOT NULL,
  type VARCHAR(32) NOT NULL,
  content_snapshot TEXT NOT NULL,
  options_snapshot TEXT,
  answer_snapshot TEXT,
  rubric_snapshot TEXT,
  difficulty_snapshot INT,
  tags_snapshot TEXT,
  assessment_points_snapshot TEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'sent',
  finished BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  answered_at TIMESTAMP(3),
  UNIQUE KEY uk_assessment_sequence(assessment_id, sequence_no),
  UNIQUE KEY uk_assessment_question(assessment_id, question_id)
);

CREATE TABLE IF NOT EXISTS assessment_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  assessment_question_id BIGINT NOT NULL,
  sender_type VARCHAR(16) NOT NULL,
  content TEXT NOT NULL,
  sequence_no INT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_message_sequence(assessment_question_id, sequence_no),
  -- 恢复现场 / 每个对话回合都要按 assessment_id 取整场消息；没有这个索引就是全表扫描
  INDEX idx_messages_assessment(assessment_id, created_at)
);

CREATE TABLE IF NOT EXISTS assessment_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_question_id BIGINT NOT NULL UNIQUE,
  answer_content TEXT NOT NULL,
  answer_count INT NOT NULL DEFAULT 1,
  result_status VARCHAR(24) NOT NULL DEFAULT 'pending',
  score DECIMAL(6,2),
  scoring_reason TEXT,
  scoring_evidence TEXT,
  confidence DECIMAL(5,4),
  submitted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  scored_at TIMESTAMP(3)
);

-- 增量迁移（可重复执行，已存在的库直接跑这一段即可）

-- 1) 发题快照保存标签与考察点，保证运行中的测评不受题库后续修改影响
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessment_questions ADD COLUMN tags_snapshot TEXT NULL, ADD COLUMN assessment_points_snapshot TEXT NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessment_questions' AND column_name = 'assessment_points_snapshot');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) 同一学生同一任务只能有一个测评会话。
--    仅当历史数据没有重复时才建立，避免破坏已有数据；重复数据需要人工确认后清理。
SET @duplicates := (SELECT COUNT(*) FROM (
  SELECT task_id, student_user_id FROM assessments
  WHERE task_id IS NOT NULL GROUP BY task_id, student_user_id HAVING COUNT(*) > 1
) AS duplicated_sessions);
SET @ddl := IF(@duplicates = 0 AND (SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'assessments' AND index_name = 'uk_assessment_task_student') = 0,
  'ALTER TABLE assessments ADD UNIQUE KEY uk_assessment_task_student(task_id, student_user_id)',
  'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 考察范围：任务型测评由教师发布时指定，自主测评由学生开始前选择。
--    历史数据的这两列为 NULL，表示不限制范围（退回全量题库）。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD COLUMN dimensions TEXT NULL, ADD COLUMN assessment_points TEXT NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND column_name = 'dimensions');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessment_tasks ADD COLUMN dimensions TEXT NULL, ADD COLUMN assessment_points TEXT NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessment_tasks' AND column_name = 'dimensions');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) 早期版本的 assessment_answers.answer_count 是 `INT NOT NULL` 且没有默认值。
--    在默认的 STRICT_TRANS_TABLES 下，省略该列会直接报
--    (1364, "Field 'answer_count' doesn't have a default value")。
--    这里补上默认值；已有数据不受影响。
SET @ddl := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE assessment_answers MODIFY COLUMN answer_count INT NOT NULL DEFAULT 1',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessment_answers'
    AND column_name = 'answer_count' AND column_default IS NULL);
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5) 维度分与考察点分（功能 F3）：一次测评 × 一个维度 / 一个考察点各一行。
--    由 Agent 在测评收尾时一次性写入，用 ON DUPLICATE KEY UPDATE 保证幂等。
--    维度分是雷达图的数据源，考察点分是技能树的数据源。
CREATE TABLE IF NOT EXISTS assessment_dimension_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  dimension VARCHAR(120) NOT NULL,
  score DECIMAL(6,2) NOT NULL,
  question_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_assessment_dimension(assessment_id, dimension),
  INDEX idx_class_student(class_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS assessment_point_scores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  assessment_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  dimension VARCHAR(120) NOT NULL,
  assessment_point VARCHAR(160) NOT NULL,
  score DECIMAL(6,2) NOT NULL,
  question_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_assessment_point(assessment_id, assessment_point),
  INDEX idx_class_student(class_id, student_user_id)
);

-- 6) assessments 补两列：综合分（六维分的平均）与能力等级（由综合分划档）。
--    这两列是班级看板、学生能力接口、教师端共用的取数来源。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD COLUMN average_score DECIMAL(6,2) NULL, ADD COLUMN ability_level VARCHAR(4) NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND column_name = 'average_score');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7) 题目分值（N19）：教师建题时填写，用于列表展示与后续按分值加权。
--    0 表示未设置分值，历史题目不受影响。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE questions ADD COLUMN score INT NOT NULL DEFAULT 100',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'score');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8) 自主练习测评的题量（N2）与学习建议（N5）。
--    question_count = 0 表示不限题量（出到班级题库没有没用过的题为止）；
--    advice 是测评收尾时生成的文字建议，历史数据为 NULL。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD COLUMN question_count INT NOT NULL DEFAULT 0, ADD COLUMN advice TEXT NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND column_name = 'question_count');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9) 个人班级画像（N16）：每个「学生 × 班级」一行，只保留该班级下最新一次测评的分数与等级。
--    写入方是 Agent 在测评收尾时 upsert；教师端后续做班级分析时直接读这张表即可，
--    不用再扫描 assessments。维度分与考察点分仍按 assessment_id 从各自的分数表读取。
CREATE TABLE IF NOT EXISTS student_class_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  student_user_id BIGINT NOT NULL,
  assessment_id BIGINT NOT NULL,
  average_score DECIMAL(6,2),
  ability_level VARCHAR(4),
  completed_at TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_class_student_profile(class_id, student_user_id),
  INDEX idx_profile_class(class_id)
);

-- 10) 性能索引补齐：都是最热路径上的查询条件，缺了就走全表扫描。
--     老库直接执行这一段即可，已存在的索引会被跳过（幂等）。

-- 10.1) 对话消息按测评取整场：恢复现场与每个对话回合都会用到。
--       原表只有 uk_message_sequence(assessment_question_id, sequence_no)，条件里没有它就帮不上忙。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessment_messages ADD INDEX idx_messages_assessment(assessment_id, created_at)',
  'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'assessment_messages' AND index_name = 'idx_messages_assessment');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10.2) 学生端「我的班级」：WHERE student_user_id=? AND status=?
--       uk_class_student 以 class_id 打头，这个查询用不上。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE class_members ADD INDEX idx_members_student_status(student_user_id, status)',
  'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'class_members' AND index_name = 'idx_members_student_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10.3) 能力画像取最近 N 次已完成测评：class_id + student_user_id + status + completed_at 排序。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD INDEX idx_assessments_class_student(class_id, student_user_id, status)',
  'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND index_name = 'idx_assessments_class_student');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10.4) 公共题库列表：WHERE visibility='public' AND status='active'。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE questions ADD INDEX idx_questions_visibility_status(visibility, status)',
  'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND index_name = 'idx_questions_visibility_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11) 清掉 assessment_tasks 上的两个死列：objective / audience。
--     教师发布任务时表单收过这两个字段，但从来没有落库（实体构造器不接收），
--     也没有任何页面展示过；任务只保留一个 description 作为「介绍」。
--     两列分开判断，避免其中一列已经被删掉时整条 ALTER 失败。
SET @ddl := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE assessment_tasks DROP COLUMN objective',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessment_tasks' AND column_name = 'objective');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE assessment_tasks DROP COLUMN audience',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessment_tasks' AND column_name = 'audience');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12) 用户的联系方式：注册表单一直在收手机号 / 邮箱，但早期版本没有落库，
--     用户填完看到「注册成功」数据却丢了。补上两列，个人中心同步可改。
--     两列分开判断，避免其中一列已经存在时整条 ALTER 失败。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE users ADD COLUMN phone VARCHAR(32) NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE users ADD COLUMN email VARCHAR(160) NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'email');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 13) 题库分类列（AI 变题功能）：老库补上 question_kind 与 source_question_id。
--     question_kind 缺列时，管理端"组织测试题库/训练题库"查询会报 Unknown column。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE questions ADD COLUMN question_kind VARCHAR(16) NOT NULL DEFAULT ''test''',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'question_kind');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE questions ADD COLUMN source_question_id BIGINT NULL',
  'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'source_question_id');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE questions ADD INDEX idx_questions_kind_status(question_kind, status)',
  'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND index_name = 'idx_questions_kind_status');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 自定义训练配置：与正式测评区分，保存模式和难度以支持断点续做。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD COLUMN training_config TEXT NULL',
  'DO 0') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND column_name = 'training_config');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
