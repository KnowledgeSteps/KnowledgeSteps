-- 持久化每个节点的逻辑毫秒和序列，确保重启、时钟回拨时不重复。
CREATE TABLE session_snowflake_state (
    worker_id INTEGER PRIMARY KEY CHECK (worker_id BETWEEN 0 AND 1023),
    last_tick INTEGER NOT NULL CHECK (last_tick >= 0)
);
