-- First-party daily aggregates; no raw addresses, URLs, names or learning targets.
CREATE TABLE analytics_settings (id INTEGER PRIMARY KEY CHECK(id=1), secret TEXT NOT NULL);
INSERT INTO analytics_settings VALUES (1, lower(hex(randomblob(32))));
CREATE TABLE analytics_daily (day TEXT PRIMARY KEY, pv INTEGER NOT NULL DEFAULT 0);
CREATE TABLE analytics_unique (
    day TEXT NOT NULL REFERENCES analytics_daily(day) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('uv','ip')),
    digest TEXT NOT NULL,
    PRIMARY KEY(day,kind,digest)
);
CREATE TABLE analytics_receipts (digest TEXT PRIMARY KEY, expires_ms INTEGER NOT NULL);
CREATE INDEX idx_analytics_receipts_expiry ON analytics_receipts(expires_ms);
