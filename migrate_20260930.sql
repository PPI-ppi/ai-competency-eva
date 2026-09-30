-- AI 能力测评 · 生产库增量迁移（2026-09-30 修复发布）
-- 用法（服务器上，需进入 mysql）：
--   mysql -uroot -p ai_assessment < migrate_20260930.sql
-- 或 mysql -uroot -p -e "source /opt/ai-assessment/migrate_20260930.sql"

USE ai_assessment;

-- 1) 题库分类列（AI 变题/组织分类题库查询依赖，缺列会报 Unknown column）
SELECT COUNT(*) INTO @has_kind FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'question_kind';
SET @ddl := IF(@has_kind = 0,
  'ALTER TABLE questions ADD COLUMN question_kind VARCHAR(16) NOT NULL DEFAULT ''test''', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2) AI 变体题来源标记
SELECT COUNT(*) INTO @has_src FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'source_question_id';
SET @ddl := IF(@has_src = 0,
  'ALTER TABLE questions ADD COLUMN source_question_id BIGINT NULL', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3) 题库分类索引
SELECT COUNT(*) INTO @has_idx FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND index_name = 'idx_questions_kind_status';
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE questions ADD INDEX idx_questions_kind_status(question_kind, status)', 'DO 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4) 校验（应各返回 1）
SELECT COUNT(*) AS question_kind_col_ok FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'question_kind';
SELECT COUNT(*) AS source_question_id_col_ok FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'questions' AND column_name = 'source_question_id';