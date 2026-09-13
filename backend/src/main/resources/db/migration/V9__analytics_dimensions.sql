CREATE TABLE analytics_dimensions (
    day TEXT NOT NULL REFERENCES analytics_daily(day) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    pv INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(day,kind,name)
);
CREATE TABLE analytics_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL REFERENCES analytics_daily(day) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    page TEXT NOT NULL,
    ip_label TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    os TEXT NOT NULL,
    browser TEXT NOT NULL
);
CREATE INDEX idx_analytics_visits_day ON analytics_visits(day,id);
