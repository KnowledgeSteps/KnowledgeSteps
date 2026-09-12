-- Creation receipts survive history deletion and application restarts.
-- They contain no session content and expire from the rolling 60-second window.
CREATE TABLE session_creation_events (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at_ms INTEGER NOT NULL
);
CREATE INDEX idx_creation_events_user_time ON session_creation_events(user_id, created_at_ms);
CREATE INDEX idx_creation_events_time ON session_creation_events(created_at_ms);
