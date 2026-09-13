-- 阅读辅助独立保存；删除寻路/节点时关联数据一并硬删除。
CREATE TABLE node_overviews (
    node_id INTEGER PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    content_markdown TEXT NOT NULL,
    generated_at TEXT NOT NULL
);

CREATE TABLE reading_explanations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    node_id INTEGER NOT NULL,
    resource_id INTEGER REFERENCES node_resources(id) ON DELETE SET NULL,
    node_name TEXT NOT NULL,
    quote TEXT NOT NULL CHECK (length(quote) BETWEEN 1 AND 1000),
    explanation_markdown TEXT NOT NULL,
    source_title TEXT NOT NULL,
    source_url TEXT,
    created_at TEXT NOT NULL,
    saved INTEGER NOT NULL DEFAULT 0 CHECK (saved IN (0, 1)),
    understood INTEGER NOT NULL DEFAULT 0 CHECK (understood IN (0, 1)),
    FOREIGN KEY (session_id, node_id) REFERENCES knowledge_nodes(session_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_reading_explanations_user_saved ON reading_explanations(user_id, saved, created_at);
