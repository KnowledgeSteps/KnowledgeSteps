-- 保留现有仓储仍在使用的旧表。旧数据库保留原记录，新数据库建立兼容表。
CREATE TABLE IF NOT EXISTS learning_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_learning_records_user_id ON learning_records(user_id);
