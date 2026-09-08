# API 约定

> 下列寻路及登录接口为第一版设计，尚不代表已实现。数据库字段见 [数据库设计](DATABASE_DESIGN.md)。

## 一、整体流程

输入目标 → 模型 A 生成节点和依赖 → 后端检查、分层 → 全部前置节点搜索知乎资料 → 模型 B 生成题目 → 用户作答 → 隐藏已掌握节点 → 展示未知节点及知乎资料。

创建任务后立即返回，后端异步处理。网络和模型调用不能占用一个长数据库事务；每个阶段用短事务保存结果。第一版可用进程内任务执行器，服务重启时将未完成的生成任务标记为失败，提示用户重新创建。

## 二、通用约定

- 业务前缀 `/api/v1`，JSON 编码 UTF-8。时间使用 UTC ISO 8601，例如 `2026-09-08T08:00:00Z`。
- 主键在数据库中为整数，在 JSON 中统一以字符串返回，前端按字符串处理。
- 登录后使用后端会话 Cookie，生产环境设置 HttpOnly、Secure；跨站部署需明确 SameSite、CORS 白名单及 CSRF 防护。写接口验证 CSRF Token。
- `user_id` 来自服务端登录态，禁止前端指定。所有会话、题目和节点接口都检查所属关系；不存在或无权访问统一返回 404。
- 默认不分页：一份任务最多 20 个前置节点，每节点最多保存 3 条资料；目标名称去除首尾空白后为 1～100 个字符。这些是项目自己的初版限制。
- 刷新页面可通过任务编号恢复进度。前端每两秒轮询状态，达到 READY、COMPLETED 或 FAILED 时停止。
- 模型输出必须经结构、数量、重复节点和循环依赖检查。搜索无结果不允许编造链接或作者。

## 三、接口清单

以下接口均为待实现；健康检查状态见文末。

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| POST | `/api/v1/learning-sessions` | 创建寻路任务 |
| GET | `/api/v1/learning-sessions/{sessionId}` | 查询阶段和进度 |
| GET | `/api/v1/learning-sessions/{sessionId}/questions` | 获取题目及已保存答案 |
| PUT | `/api/v1/learning-sessions/{sessionId}/answers/{questionId}` | 保存或修改答案 |
| POST | `/api/v1/learning-sessions/{sessionId}/complete` | 完成答卷并返回结果 |
| GET | `/api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources` | 获取结果节点资料 |

### 1. 创建任务

请求 `POST /api/v1/learning-sessions`：

```json
{ "target": "Transformer" }
```

成功返回 202：

```json
{ "sessionId": "101", "status": "GENERATING_GRAPH" }
```

失败：400 `INVALID_TARGET`（空白或超长），401 `UNAUTHORIZED`，429 `RATE_LIMITED`。按钮提交期间禁用；重新创建属于新任务。

### 2. 查询任务

请求 `GET /api/v1/learning-sessions/101`，无请求体。成功返回 200：

```json
{
  "sessionId": "101",
  "target": "Transformer",
  "status": "SEARCHING_RESOURCES",
  "progress": { "processedNodes": 4, "totalNodes": 7 },
  "warnings": [],
  "error": null
}
```

进度数仅表示当前搜索阶段已处理节点数，未生成节点时 totalNodes 为 0。单节点搜索失败放入 warnings，继续生成答卷。模型生成失败时本接口仍返回 200，但 status 为 FAILED，error 为错误对象，例如：

```json
{
  "sessionId": "101",
  "target": "Transformer",
  "status": "FAILED",
  "progress": { "processedNodes": 0, "totalNodes": 0 },
  "warnings": [],
  "error": { "code": "GRAPH_GENERATION_FAILED", "message": "前置知识生成失败，请重新创建任务。" }
}
```

失败：401、404。错误不能包含密钥、上游完整响应或服务器堆栈。

### 3. 获取答卷

请求 `GET /api/v1/learning-sessions/101/questions`，无请求体。仅 READY、COMPLETED 可查询。成功返回 200：

```json
{
  "questions": [
    {
      "questionId": "301",
      "nodeId": "201",
      "nodeName": "矩阵运算",
      "questionText": "你了解矩阵乘法吗？",
      "hint": "它会用于理解注意力机制中的计算过程。",
      "options": [
        { "value": "VERY_FAMILIAR", "label": "非常了解" },
        { "value": "BASICALLY_KNOW", "label": "基本了解" },
        { "value": "HEARD_OF", "label": "听说过" },
        { "value": "DONT_KNOW", "label": "不了解" }
      ],
      "answer": null
    }
  ]
}
```

answer 有值时为选项枚举字符串。按 sort_order 排序，目标节点不出题；此接口不返回知乎资料。

失败：401、404、409 `SESSION_NOT_READY`。

### 4. 保存答案

请求 `PUT /api/v1/learning-sessions/101/answers/301`：

```json
{ "answer": "VERY_FAMILIAR" }
```

成功返回 200：

```json
{ "questionId": "301", "masteryStatus": "MASTERED", "answeredCount": 1, "totalQuestions": 7 }
```

前两项映射 MASTERED，后两项映射 TO_LEARN。答案按 question_id 更新或新增，重复提交不重复计数。答案与节点状态在同一事务更新。

允许在 READY、COMPLETED 修改；已完成后修改答案会把会话恢复为 READY，清除完成时间，前端重新调用 complete。页面注明“基于你的自评生成”，不是客观能力考试。

失败：400 `INVALID_ANSWER`，401、404、409 `SESSION_NOT_READY`。

### 5. 完成答卷

请求 `POST /api/v1/learning-sessions/101/complete`，无请求体。成功返回 200：

```json
{
  "sessionId": "101",
  "status": "COMPLETED",
  "target": "Transformer",
  "missingCount": 2,
  "nodes": [
    { "id": "204", "name": "Attention", "isTarget": false, "level": 0 },
    { "id": "205", "name": "Self-Attention", "isTarget": false, "level": 1 },
    { "id": "208", "name": "Transformer", "isTarget": true, "level": 2 }
  ],
  "edges": [
    { "from": "204", "to": "205" },
    { "from": "205", "to": "208" }
  ]
}
```

后端在事务内确认全部题目已回答并标记完成。保留 TO_LEARN 节点和目标，缺口数量不含目标。原始节点和资料不删除。

隐藏中间节点时连接最近的可见后继，保持原有可达关系并去除重复边；结果重新分层，保留并行分叉，不强行线性排序。全部前置已掌握时 missingCount 为 0，仅返回目标节点；没有前置节点时也允许直接完成。

该接口可重复调用以恢复结果，无答案变化时返回相同内容，不重新调用模型或搜索。

失败：401、404、409 `SESSION_NOT_READY` 或 `ANSWERS_INCOMPLETE`。

### 6. 节点资料

请求 `GET /api/v1/learning-sessions/101/nodes/204/resources`，无请求体。仅完成会话中可见的节点可查询。成功返回 200：

```json
{
  "nodeId": "204",
  "nodeName": "Attention",
  "reason": "理解注意力机制有助于学习自注意力结构。",
  "resourceStatus": "EMPTY",
  "resources": []
}
```

每条 resources 包含 id、title、url、summary、authorName、voteCount。实际值来自知乎 API，不捏造示例文章。可缺失字段为 null，不使用 0 冒充未知点赞数。按 sort_order 排序，最多 3 条。资源状态区分 READY、EMPTY、FAILED；搜索失败时仍返回 200 和空数组，前端显示失败提示。

第一版仅搜索前置节点，目标节点返回 resourceStatus 为 NOT_APPLICABLE、resources 为空。

失败：401、404、409 `SESSION_NOT_COMPLETED`。

## 四、统一错误响应

业务请求失败使用对应 HTTP 状态码和以下结构：

```json
{ "error": { "code": "ANSWERS_INCOMPLETE", "message": "还有题目未作答，请完成后再查看结果。" } }
```

| 状态码 | 错误码 | 处理方式 |
| --- | --- | --- |
| 400 | INVALID_TARGET / INVALID_ANSWER | 修改输入后重试 |
| 401 | UNAUTHORIZED | 重新登录 |
| 403 | CSRF_INVALID | 刷新页面获取有效令牌 |
| 404 | NOT_FOUND | 对象不存在或不属于当前用户 |
| 409 | SESSION_NOT_READY / SESSION_NOT_COMPLETED / ANSWERS_INCOMPLETE | 按提示等待或完成答卷 |
| 429 | RATE_LIMITED | 稍后重试，遵循 Retry-After |
| 500 | INTERNAL_ERROR | 提示重试，不暴露内部信息 |

## 五、登录与外部服务边界

登录接口建议预留 `GET /api/v1/auth/zhihu/login`（跳转授权）、`GET /api/v1/auth/zhihu/callback`（验证 state、换取身份、建立本地会话）、`GET /api/v1/auth/me`（返回当前用户）、`POST /api/v1/auth/logout`（销毁会话）。OAuth 的具体 URL、授权范围和用户字段需按官方 skill 核实后补充，不能假定授权后可读取所有用户数据。

模型 A 输入目标，输出稳定临时节点标识、名称、描述、依赖边；由后端分配数据库 ID。模型 B 输入已校验节点及数据库 ID，为每个前置节点输出一道题目和提示。后端校验题目覆盖完整且不重复。

知乎搜索在后端执行，每个前置节点独立请求、限并发、超时控制，限次重试；返回结果以 node_id 绑定并缓存。所有节点处理完毕后再生成答卷，符合当前产品流程。具体上游参数和额度以赛事官方文档为准。

每个接口改动都要在 PR 中更新本文件，并提供请求、成功响应和失败响应示例。

## 当前基础接口

| 接口 | 用途 | 状态 |
| --- | --- | --- |
| `GET /actuator/health` | 部署后健康检查 | 已实现 |

## 数据边界

- 知乎 OAuth Token、Access Secret 和模型密钥只在后端环境变量中使用，不能返回给浏览器。
- 查询学习记录必须同时使用当前用户标识和记录 ID；不能只按记录 ID 查询。
- 未完成 OAuth 接入前，不得用开发者账户的数据冒充登录用户的数据。
