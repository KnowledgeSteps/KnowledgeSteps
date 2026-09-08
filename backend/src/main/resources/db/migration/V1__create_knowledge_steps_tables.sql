-- 新增七张业务表，保留旧 learning_records 及数据。
-- Flyway 迁移执行一次；已应用后新增版本，不修改本文件。
-- 必须在连接建立时、事务开始前启用 foreign_keys。
-- UTC ISO 8601 时间由后端填写。
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    zhihu_user_id TEXT NOT NULL UNIQUE,
    nickname TEXT,
    avatar_url TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE learning_sessions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_name TEXT NOT NULL CHECK (length(trim(target_name)) BETWEEN 1 AND 100),
    status TEXT NOT NULL CHECK (status IN ('GENERATING_GRAPH', 'SEARCHING_RESOURCES', 'GENERATING_QUESTIONS', 'READY', 'COMPLETED', 'FAILED')),
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX idx_learning_sessions_user_created ON learning_sessions(user_id, created_at);

CREATE TABLE knowledge_nodes (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    is_target INTEGER NOT NULL DEFAULT 0 CHECK (is_target IN (0, 1)),
    level INTEGER NOT NULL CHECK (level >= 0),
    mastery_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (mastery_status IN ('UNKNOWN', 'MASTERED', 'TO_LEARN')),
    resource_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (resource_status IN ('PENDING', 'READY', 'EMPTY', 'FAILED', 'NOT_APPLICABLE')),
    UNIQUE (session_id, name),
    UNIQUE (session_id, id),
    CHECK (is_target = 0 OR (mastery_status = 'UNKNOWN' AND resource_status = 'NOT_APPLICABLE'))
);
CREATE UNIQUE INDEX uq_knowledge_nodes_session_target ON knowledge_nodes(session_id) WHERE is_target = 1;

CREATE TABLE knowledge_edges (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE RESTRICT,
    prerequisite_node_id INTEGER NOT NULL,
    dependent_node_id INTEGER NOT NULL,
    FOREIGN KEY (session_id, prerequisite_node_id) REFERENCES knowledge_nodes(session_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (session_id, dependent_node_id) REFERENCES knowledge_nodes(session_id, id) ON DELETE RESTRICT,
    UNIQUE (session_id, prerequisite_node_id, dependent_node_id),
    CHECK (prerequisite_node_id <> dependent_node_id)
);
CREATE INDEX idx_knowledge_edges_session_dependent ON knowledge_edges(session_id, dependent_node_id);

CREATE TABLE node_resources (
    id INTEGER PRIMARY KEY,
    node_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    summary TEXT,
    author_name TEXT,
    vote_count INTEGER CHECK (vote_count >= 0),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    fetched_at TEXT NOT NULL,
    UNIQUE (node_id, url)
);
CREATE INDEX idx_node_resources_node_sort ON node_resources(node_id, sort_order);

CREATE TABLE assessment_questions (
    id INTEGER PRIMARY KEY,
    node_id INTEGER NOT NULL UNIQUE REFERENCES knowledge_nodes(id) ON DELETE RESTRICT,
    question_text TEXT NOT NULL,
    hint TEXT,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0)
);

CREATE TABLE assessment_answers (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL UNIQUE REFERENCES assessment_questions(id) ON DELETE RESTRICT,
    answer_value TEXT NOT NULL CHECK (answer_value IN ('VERY_FAMILIAR', 'BASICALLY_KNOW', 'HEARD_OF', 'DONT_KNOW')),
    answered_at TEXT NOT NULL
);

-- 应用负责无环检查、恰好一个目标、每节点最多三条资料、目标不出题、
-- 节点名称规范化、答案和掌握状态同事务更新、状态流转及权限检查。
