# 知阶数据库设计

> 第一版字段设计，已提供 V1/V2 迁移；具体数据库是否已迁移须检查其 Flyway 历史。当前主流程业务接口已实现，仍需以后端运行环境和 Flyway 历史为准确认实际库状态。不要直接删除现有表。接口见 [接口约定](API_CONTRACT.md)，迁移操作见 [迁移说明](FLYWAY.md)。

## 一、数据关系

一次寻路对应一个 learning_sessions。会话属于用户，节点属于会话，依赖边连接同一会话中的两个节点。每个前置节点有一题和最多五条知乎资料，每题只有一份可修改的当前答案。

```text
users → learning_sessions → knowledge_nodes → node_resources
                         │                 └→ assessment_questions → assessment_answers
                         └→ knowledge_edges（前置节点 → 后续节点）
```

第一版共七张表。不单独建立最终结果表：结果从节点掌握状态和原始依赖边推导。全部节点均保留展示；非常了解的节点不搜索资料。

## 二、字段规范

- SQLite 主键统一 `INTEGER PRIMARY KEY`；API 中 ID 使用字符串。
- 时间使用 TEXT 保存 UTC ISO 8601，created_at、updated_at 由后端填写。
- 布尔值使用 INTEGER，限制为 0 或 1。枚举使用 TEXT，并增加 CHECK 约束。
- 下表“必填”表示 NOT NULL；“可空”表示允许 NULL。外键默认限制删除，用户删除与数据保留策略后续单独设计。
- SQLite 每个连接都需启用 `PRAGMA foreign_keys = ON`。本地数据库文件不入 Git；数据库文件所在目录由应用启动前创建。

## 三、表结构

### 1. users：用户

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 内部用户编号 |
| zhihu_user_id | TEXT | 必填、唯一 | OAuth 用户的官方稳定标识，或带前缀的内部身份标识 |
| nickname | TEXT | 可空 | 昵称，不用于权限判断 |
| avatar_url | TEXT | 可空 | 头像地址 |
| created_at | TEXT | 必填 | 创建时间 |

不保存模型密钥或 OAuth Token 明文。第一版若只用 OAuth 识别身份，不需要长期保存用户令牌；如后续接口必须使用用户令牌，再单独设计加密存储与刷新机制。

当前管理员登录复用本表，标识为 `admin:<用户名>`；本地自动测试身份使用 `local-test:<名称>`。管理员只拥有自己创建的任务，不获得跨用户访问权限；密码哈希保存在后端私密配置，不写入本表，因此不需要增加表或修改已应用的迁移。

### 2. learning_sessions：寻路会话

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 会话编号 |
| user_id | INTEGER | 必填、外键 users.id | 所属用户 |
| target_name | TEXT | 必填 | 学习目标，1～100 字符 |
| status | TEXT | 必填 | 见下方状态表 |
| error_code | TEXT | 可空 | 失败原因代码 |
| error_message | TEXT | 可空 | 可向用户展示的失败说明 |
| created_at | TEXT | 必填 | 创建时间 |
| updated_at | TEXT | 必填 | 最新修改时间 |
| completed_at | TEXT | 可空 | 完成时间；修改答案后清空 |

状态顺序：GENERATING_GRAPH → GENERATING_QUESTIONS → READY → SEARCHING_RESOURCES → COMPLETED。生成阶段不可恢复错误进入 FAILED；已完成后修改答案回到 READY。

进度数从节点 resource_status 聚合，答题数从答案表聚合，不再重复存储计数。索引 `(user_id, created_at)`。

### 3. knowledge_nodes：知识节点

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 节点编号 |
| session_id | INTEGER | 必填、外键 learning_sessions.id | 所属会话 |
| name | TEXT | 必填 | 节点名称 |
| description | TEXT | 必填 | 为什么需要学习这个知识 |
| is_target | INTEGER | 必填，默认 0 | 是否为最终学习目标 |
| level | INTEGER | 必填，非负 | 原图层级，基础在上，目标在下 |
| mastery_status | TEXT | 必填，默认 UNKNOWN | UNKNOWN / MASTERED / TO_LEARN |
| resource_status | TEXT | 必填，默认 PENDING | PENDING / READY / EMPTY / FAILED / NOT_APPLICABLE |

同一会话内名称经后端规范化去重。唯一约束 `(session_id, name)`；另加 `(session_id, id)` 唯一约束供复合外键引用。部分唯一索引确保一个会话最多一个 is_target=1 节点；后端在图保存事务内保证恰好一个目标。

目标不出题，mastery_status 保持 UNKNOWN，resource_status 为 NOT_APPLICABLE；缺口统计排除目标。

### 4. knowledge_edges：知识依赖

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 依赖编号 |
| session_id | INTEGER | 必填、外键 learning_sessions.id | 所属会话 |
| prerequisite_node_id | INTEGER | 必填 | 前置节点 |
| dependent_node_id | INTEGER | 必填 | 后续节点 |

增加复合外键 `(session_id, prerequisite_node_id)`、`(session_id, dependent_node_id)`，均引用 knowledge_nodes 的 `(session_id, id)`，避免跨会话连边。

唯一约束 `(session_id, prerequisite_node_id, dependent_node_id)`，CHECK 两端不相同。后端检查无环、所有前置节点都能到达目标，再按拓扑顺序计算 level。关系允许分叉、汇合，不使用单一 parent_id。

### 5. node_resources：知乎资料

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 资料编号 |
| node_id | INTEGER | 必填、外键 knowledge_nodes.id | 对应知识 |
| title | TEXT | 必填 | 官方搜索结果标题 |
| url | TEXT | 必填 | 原文链接 |
| summary | TEXT | 可空 | 搜索摘要 |
| author_name | TEXT | 可空 | 作者名称 |
| vote_count | INTEGER | 可空，非负 | 未提供时为 NULL |
| sort_order | INTEGER | 必填，非负 | 后端筛选后的展示顺序 |
| fetched_at | TEXT | 必填 | 抓取时间 |

唯一约束 `(node_id, url)`，索引 `(node_id, sort_order)`。后端每节点最多保存三条，使用实际 API 提供的相关性等信号排序；不把点赞数当唯一质量标准。刷新搜索结果时在短事务内替换，不能部分写入后显示 READY。

第一版资料缓存属于会话，暂不建立跨用户共享缓存表。

### 6. assessment_questions：题目

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 题目编号 |
| node_id | INTEGER | 必填、唯一、外键 knowledge_nodes.id | 每前置节点一道题 |
| question_text | TEXT | 必填 | 模型生成的问题 |
| hint | TEXT | 可空 | 知识用途说明 |
| sort_order | INTEGER | 必填，非负 | 展示顺序 |

选项为四个固定枚举，不重复存 JSON。第一版是自评问卷，没有正确答案字段。模型 B 必须使用现有 node_id，后端检查不漏题、不重复、不针对目标出题。

### 7. assessment_answers：当前答案

| 字段 | 类型 | 要求 | 说明 |
| --- | --- | --- | --- |
| id | INTEGER | 主键 | 答案编号 |
| question_id | INTEGER | 必填、唯一、外键 assessment_questions.id | 对应题目 |
| answer_value | TEXT | 必填 | 四个固定选项之一 |
| answered_at | TEXT | 必填 | 最新作答时间 |

| 选项 | 文案 | 节点状态 |
| --- | --- | --- |
| VERY_FAMILIAR | 非常了解 | MASTERED |
| BASICALLY_KNOW | 基本了解 | TO_LEARN |
| HEARD_OF | 听说过 | TO_LEARN |
| DONT_KNOW | 不了解 | TO_LEARN |

答案所属用户沿“题目 → 节点 → 会话 → 用户”验证，不重复保存 user_id。保存答案、更新 mastery_status、重置会话完成状态必须处于同一事务。重复提交更新原记录，不新增记录。

## 四、实现与验证重点

1. 原图保存时一次性写入节点和边；非法引用、重复和循环依赖在提交事务前拒绝。
2. 展示剪枝只生成返回数据，不删除表中节点、边或资料；跨越已掌握节点时保留可见节点间的先后关系。
3. complete 与答案更新使用一致的事务边界，避免完成结果读到一半旧答案、一半新答案。
4. SQLite 单实例运行，长耗时模型调用放在事务外；使用持久化目录，设置合理忙等待，避免长时间占用写锁。
5. 测试使用独立临时数据库，验证建表、唯一约束、外键隔离、重复答案更新、全部已掌握、搜索失败，以及空缺口结果。
6. 后续结构变更用有版本的迁移处理，`CREATE TABLE IF NOT EXISTS` 不能完成已有表的字段升级；上线迁移前备份数据。

本文件是字段和行为设计；实际可用状态以已运行的迁移、后端接口和测试结果共同确认为准。

当前实现进展：创建任务、图与依赖保存、节点搜索结果、自评题保存、答案保存、完成结果推导、节点资料读取及进度查询已使用上述表；本地测试身份写入带 local-test: 前缀的用户。本轮未修改 V1/V2 或增加表。数据库连接设置 5 秒忙等待，生成链路使用短事务；启动时把生成中任务标记为失败以避免永久停留。


本次四档资料规则、旧任务迁移和搜索恢复行为详见 [自评与资料规则](ASSESSMENT_RESOURCES.md)。
