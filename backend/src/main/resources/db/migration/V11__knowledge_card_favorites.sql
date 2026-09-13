CREATE TABLE knowledge_card_favorites (
    node_id INTEGER PRIMARY KEY REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    saved_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_card_favorites_user ON knowledge_card_favorites(user_id, saved_at);
