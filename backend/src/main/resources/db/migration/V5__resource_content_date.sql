-- 知乎 EditTime 表示发布时间或更新时间；不可冒充首次发布日期。
ALTER TABLE node_resources ADD COLUMN content_date TEXT;
