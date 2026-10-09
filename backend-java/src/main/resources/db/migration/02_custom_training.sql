
-- 自定义训练配置：与正式测评区分，保存模式和难度以支持断点续做。
SET @ddl := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE assessments ADD COLUMN training_config TEXT NULL',
  'DO 0') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'assessments' AND column_name = 'training_config');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
