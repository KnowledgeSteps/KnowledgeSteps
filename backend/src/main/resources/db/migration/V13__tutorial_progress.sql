CREATE TABLE tutorial_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 5),
  prompted INTEGER NOT NULL DEFAULT 0 CHECK(prompted IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
