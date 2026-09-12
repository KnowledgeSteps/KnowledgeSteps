-- Short-lived idempotency receipts; retain a tombstone after hard deletion, no original target text.
CREATE TABLE session_creation_keys (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_key TEXT NOT NULL,
    target_hash TEXT NOT NULL,
    session_id INTEGER REFERENCES learning_sessions(id) ON DELETE SET NULL,
    created_at_ms INTEGER NOT NULL,
    PRIMARY KEY(user_id, request_key)
);
CREATE INDEX idx_creation_keys_time ON session_creation_keys(created_at_ms);
