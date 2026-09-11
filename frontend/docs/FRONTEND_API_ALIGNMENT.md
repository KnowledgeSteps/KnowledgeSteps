# 前端视角接口对齐分析

本文档用于把当前后端已提供的接口，与前端页面、状态机和字段依赖进行对齐。重点不是重新定义后端实现，而是从前端联调角度确认：哪些接口已可用、哪些字段必须稳定、哪些异常态需要页面兜底。

信息来源：

- 后端 Controller：`backend/src/main/java/com/zhihu/hackathon/auth/AuthController.java`、`backend/src/main/java/com/zhihu/hackathon/session/LearningSessionController.java`
- 后端响应类型：`backend/src/main/java/com/zhihu/hackathon/session/*Response.java`、`SessionStore.Snapshot`
- 前端 API 类型与页面：`frontend/src/api/types.ts`、`frontend/src/api/sessions.ts`、`frontend/src/pages/*`
- 现有契约文档：`docs/API_CONTRACT.md`、`docs/FRONTEND.md`、`docs/FRONTEND_PLAN.md`

## 一、统计结论

### 1. 后端接口统计

| 分类 | 数量 | 状态 | 说明 |
| --- | ---: | --- | --- |
| `/api/v1/auth/*` | 2 | 已实现基础会话接口 | `auth/me`、`logout` 已有；知乎 OAuth 登录和回调未实现 |
| `/api/v1/learning-sessions*` | 6 | 已实现主流程接口 | 覆盖创建、查询、题目、答题、完成、资料 |
| `/api/test/*` | 2 | 本地上游验证接口 | 只用于开发验证模型和知乎搜索，不应进入前端生产流程 |
| 分页接口 | 0 | 暂无 | 当前页面不需要列表分页 |
| 文件上传/导出接口 | 0 | 暂无 | 当前产品流程不涉及 |

### 2. 前端接口需求统计

| 页面/模块 | 需要接口数 | 统一入口函数 | 真实接入情况 |
| --- | ---: | --- | --- |
| 首页创建任务 | 1 | `createSession` | 已接入，不自动重试 |
| 任务等待和轮询 | 1 | `getSession` | 已接入，2000ms 轮询 |
| 自评问卷页 | 3 | `getQuestions`、`saveAnswer`、`completeSession` | 已接入 |
| 结果页 | 2 | `completeSession`、`getNodeResources` | 已接入 |
| 全局认证/CSRF | 1 到 2 | `getCurrentUser`、`logout` | `auth/me` 已接入；`logout` 已实现函数但页面没有入口 |

7 个 P0 接口（`auth/me` 加 6 个学习任务接口）均已在 `frontend/src/api/real/` 下接入，页面通过 `frontend/src/api/sessions.ts` 统一调用。`logout` 仍属 P2，等页面增加用户菜单再接。

### 3. 主要对齐风险

状态列以 2026-09-11 的源码核对结果为准。

| 风险 | 状态 | 位置 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| `warnings` 类型不一致 | 已解决 | `SessionDetail.warnings` 已改为 `SessionWarning[]`，`real/sessions.ts` 用 `parseWarning` 校验 | — | 字段已对齐；但全站仍无渲染入口，见下一行 |
| `warnings` 没有展示入口 | 未解决 | 字段已解析，等待页和结果页都没有消费 | 单节点资料搜索失败对用户完全不可见 | 在等待页或结果页补一处非阻断提示 |
| 前端还没有认证和 CSRF HTTP 层 | 已解决 | `api/auth.ts` 接入 `auth/me` 并内存缓存 token，`real/sessions.ts` 的写请求带 `X-CSRF-Token`，`CSRF_INVALID` 刷新但不重放 | — | 保持不自动重放写请求的约定 |
| `resourceStatus: PENDING` 未处理 | 未解决 | 代码与数据库都有 5 个取值，`ResourcesDrawer` 只分支了 4 个 | PENDING 落入 READY 分支，渲染成“有 reason、零资料”的正常态 | 补 PENDING 独立文案，或由后端保证可见节点不返回 PENDING |
| 答题进度以前端计数为准 | 未解决 | `saveAnswer` 返回的 `answeredCount`、`totalQuestions`、`masteryStatus` 被丢弃 | 与后端口径可能漂移，多标签页改答案时更明显 | 改为以服务端返回校准界面 |
| 请求无超时与取消 | 未解决 | `http.ts` 没有 AbortController，`useSession` 只用 `cancelled` 标志忽略响应 | 切换 sessionId 时旧请求仍在飞；慢响应无上限等待 | 补请求取消与超时 |
| 错误重试没有退避 | 未解决 | 网络错误与 5xx 固定 2000ms 无上限重试；429 的 `Retry-After` 未读取 | 后端异常时前端持续压请求 | 改为 2/4/8 秒有限退避加手动重试出口 |
| 结果恢复依赖 `POST complete` | 保持现状 | 后端没有 `GET result` | 结果页刷新必须再次调用 `complete`，且它是写方法，需要 CSRF | 已按此实现；是否补只读接口见第八节待确认问题 |
| 文档状态需要持续同步 | 持续 | 本轮已按源码重新校准 M5 与差距表 | 联调人员可能被过期口径误导 | 接口、数据库、前端方案和 TODO 文档随 PR 同步更新 |
| 本地开发与生产登录状态差异 | 未解决 | `local-test` 会自动固定身份，普通配置未登录返回 401；前端没有登录入口 | 前端本地可用不代表生产可登录 | 联调时明确 profile；生产前需要 OAuth 登录接口 |
| 缺少真实模型与检索凭证 | 未解决 | 仓库只有 `backend/secrets.properties.example` | 任务稳定失败为 `GRAPH_GENERATION_FAILED`，真实链路走不到结果页 | 补本地密钥后重跑完整手动验收 |

## 二、前端用户动作拆解

| 用户动作/页面状态 | 数据需求 | 对应接口 | 优先级 |
| --- | --- | --- | --- |
| 应用启动或第一次调用业务接口前 | 获取当前用户、会话 Cookie、CSRF token | `GET /api/v1/auth/me` | P0 |
| 首页输入学习目标并提交 | 创建异步生成任务，拿到 `sessionId` | `POST /api/v1/learning-sessions` | P0 |
| 进入问卷页或结果页 | 读取任务状态，生成中每 2 秒轮询 | `GET /api/v1/learning-sessions/{sessionId}` | P0 |
| 任务进入 `READY` 或 `COMPLETED` | 读取题目、选项、已保存答案 | `GET /api/v1/learning-sessions/{sessionId}/questions` | P0 |
| 用户选择或修改答案 | 保存答案，更新本题掌握状态和已答计数 | `PUT /api/v1/learning-sessions/{sessionId}/answers/{questionId}` | P0 |
| 全部答完后点击查看结果 | 完成答卷，返回裁剪后的可见路径 | `POST /api/v1/learning-sessions/{sessionId}/complete` | P0 |
| 结果页刷新 | 恢复结果图 | `POST /api/v1/learning-sessions/{sessionId}/complete` | P0 |
| 点击结果节点 | 获取节点说明、资料状态和知乎资料 | `GET /api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources` | P0 |
| 用户主动退出 | 销毁服务器会话 | `POST /api/v1/auth/logout` | P2 |
| 生产环境知乎授权登录 | 跳转授权并建立本地会话 | `GET /api/v1/auth/zhihu/login`、`GET /api/v1/auth/zhihu/callback` | P1，后端未实现 |

## 三、接口总览表

| 接口名称 | 方法 | 路径 | 使用场景 | 入参 | 返回 | 分页 | 鉴权 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 获取当前用户 | GET | `/api/v1/auth/me` | 前端启动、刷新 CSRF | 无 | `userId`、`csrfToken` | 否 | 需要会话；`local-test` 可自动创建测试身份 |
| 退出登录 | POST | `/api/v1/auth/logout` | 后续用户入口 | Header `X-CSRF-Token` | 204 无体 | 否 | 需要会话和 CSRF |
| 创建学习任务 | POST | `/api/v1/learning-sessions` | 首页提交目标 | Body `{ target }`，Header `X-CSRF-Token` | `sessionId`、`status` | 否 | 需要会话和 CSRF |
| 查询任务状态 | GET | `/api/v1/learning-sessions/{sessionId}` | 页面初始化、生成轮询 | Path `sessionId` | 任务快照 | 否 | 需要会话 |
| 获取自评题 | GET | `/api/v1/learning-sessions/{sessionId}/questions` | 问卷页加载和恢复答案 | Path `sessionId` | `questions[]` | 否 | 需要会话 |
| 保存答案 | PUT | `/api/v1/learning-sessions/{sessionId}/answers/{questionId}` | 选择或修改答案 | Path `sessionId`、`questionId`；Body `{ answer }`；Header `X-CSRF-Token` | 答案保存结果 | 否 | 需要会话和 CSRF |
| 完成答卷 | POST | `/api/v1/learning-sessions/{sessionId}/complete` | 查看结果、结果页刷新恢复 | Path `sessionId`；Header `X-CSRF-Token` | 结果图 | 否 | 需要会话和 CSRF |
| 获取节点资料 | GET | `/api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources` | 结果页节点侧栏 | Path `sessionId`、`nodeId` | 节点资料 | 否 | 需要会话 |

## 四、接口用途、参数与返回字段草案

### 1. 获取当前用户

`GET /api/v1/auth/me`

前端用途：

- 获取当前登录态。
- 获取后续写接口要携带的 `csrfToken`。
- 建立或续用会话 Cookie。

成功返回：

```json
{
  "userId": "1",
  "csrfToken": "session-bound-token"
}
```

前端约定：

- `userId` 只用于调试或展示，不参与业务请求入参。
- `csrfToken` 存在内存即可，不建议持久化到 `localStorage`。
- 所有业务写请求统一带 `X-CSRF-Token`。

### 2. 创建学习任务

`POST /api/v1/learning-sessions`

前端用途：

- 首页输入目标后创建一条异步任务。
- 成功后跳转 `/sessions/{sessionId}/questions`。

请求：

```json
{
  "target": "Transformer"
}
```

成功返回，HTTP 202：

```json
{
  "sessionId": "101",
  "status": "GENERATING_GRAPH"
}
```

字段要求：

| 字段 | 类型 | 前端用途 |
| --- | --- | --- |
| `sessionId` | string | 路由参数、后续接口 Path 参数 |
| `status` | enum | 初始状态，通常为 `GENERATING_GRAPH` |

前端校验：

- `target.trim()` 后不能为空。
- 目标长度不超过 100 字符。
- 创建请求不自动重试，避免重复创建任务。

### 3. 查询任务状态

`GET /api/v1/learning-sessions/{sessionId}`

前端用途：

- 问卷页和结果页都先读取任务状态。
- `GENERATING_GRAPH`、`SEARCHING_RESOURCES`、`GENERATING_QUESTIONS` 时每 2 秒轮询。
- `READY` 后加载题目。
- `COMPLETED` 后可进入复核或恢复结果。
- `FAILED` 展示失败原因并引导重新创建任务。

成功返回：

```json
{
  "sessionId": "101",
  "target": "Transformer",
  "status": "SEARCHING_RESOURCES",
  "progress": {
    "processedNodes": 4,
    "totalNodes": 10
  },
  "warnings": [
    {
      "nodeId": "204",
      "code": "RESOURCE_SEARCH_FAILED",
      "message": "该节点资料搜索失败。"
    }
  ],
  "error": null
}
```

字段要求：

| 字段 | 类型 | 前端用途 |
| --- | --- | --- |
| `sessionId` | string | 防止旧请求覆盖当前页面 |
| `target` | string | 页面标题、等待页目标名 |
| `status` | enum | 页面状态机 |
| `progress.processedNodes` | number | 搜索资料进度 |
| `progress.totalNodes` | number | 搜索资料总节点数 |
| `warnings[]` | object[] | 搜索失败提示，可展示为非阻断警告 |
| `error` | object/null | `FAILED` 时展示失败原因 |

前端已修正：

- `frontend/src/api/types.ts` 中 `warnings` 已是对象数组，`real/sessions.ts` 用 `parseWarning` 逐项校验：

```ts
interface SessionWarning {
  nodeId: string
  code: string
  message: string
}
```

仍待处理：字段已解析，但等待页与结果页都没有消费它，单节点资料搜索失败对用户不可见。

### 4. 获取自评题

`GET /api/v1/learning-sessions/{sessionId}/questions`

前端用途：

- `READY` 或 `COMPLETED` 状态下加载问卷。
- 刷新页面时恢复已保存答案。
- 从结果页返回修改时继续复核。

成功返回：

```json
{
  "questions": [
    {
      "questionId": "301",
      "nodeId": "204",
      "nodeName": "矩阵运算",
      "questionText": "你熟悉向量、矩阵和矩阵乘法吗？",
      "hint": "Transformer 的注意力计算大量使用矩阵乘法。",
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

字段要求：

| 字段 | 类型 | 前端用途 |
| --- | --- | --- |
| `questions[]` | array | 题目列表，允许空数组 |
| `questionId` | string | 保存答案 Path 参数 |
| `nodeId` | string | 和结果节点、资料节点关联 |
| `nodeName` | string | 右侧状态栏展示 |
| `questionText` | string | 主问题 |
| `hint` | string/null | 辅助说明，可为空 |
| `options[]` | array | 固定四档选项 |
| `answer` | enum/null | 恢复已答状态 |

空态约定：

- `questions: []` 是合法成功态，表示目标没有需要确认的前置知识。
- 前端应显示“无需额外确认”，并允许继续调用 `complete`。

### 5. 保存答案

`PUT /api/v1/learning-sessions/{sessionId}/answers/{questionId}`

前端用途：

- 用户点击选项后保存答案。
- 已完成任务返回问卷修改答案时，保存成功会使后端会话回到 `READY`，前端应清理旧结果并重新 `complete`。

请求：

```json
{
  "answer": "BASICALLY_KNOW"
}
```

成功返回：

```json
{
  "questionId": "301",
  "masteryStatus": "MASTERED",
  "answeredCount": 3,
  "totalQuestions": 10
}
```

字段要求：

| 字段 | 类型 | 前端用途 |
| --- | --- | --- |
| `questionId` | string | 确认保存的是当前题 |
| `masteryStatus` | enum | 可用于统计已掌握/待学习 |
| `answeredCount` | number | 答题进度 |
| `totalQuestions` | number | 答题总数 |

答案枚举：

| answer | 前端文案 | 后端掌握状态 |
| --- | --- | --- |
| `VERY_FAMILIAR` | 非常了解 | `MASTERED` |
| `BASICALLY_KNOW` | 基本了解 | `MASTERED` |
| `HEARD_OF` | 听说过 | `TO_LEARN` |
| `DONT_KNOW` | 不了解 | `TO_LEARN` |

重复提交约定：

- 同一道题重复保存应覆盖原答案，不重复计数。
- 保存失败时前端保留当前题，允许用户重试。

### 6. 完成答卷并获取结果

`POST /api/v1/learning-sessions/{sessionId}/complete`

前端用途：

- 全部题目已答后生成结果。
- 结果页刷新或直接进入结果页时恢复结果。

成功返回：

```json
{
  "sessionId": "101",
  "status": "COMPLETED",
  "target": "Transformer",
  "missingCount": 3,
  "nodes": [
    {
      "id": "204",
      "name": "矩阵运算",
      "isTarget": false,
      "level": 0
    },
    {
      "id": "210",
      "name": "Transformer",
      "isTarget": true,
      "level": 2
    }
  ],
  "edges": [
    {
      "from": "204",
      "to": "210"
    }
  ]
}
```

字段要求：

| 字段 | 类型 | 前端用途 |
| --- | --- | --- |
| `missingCount` | number | 结果页主标题和统计 |
| `nodes[]` | array | 绘制路径节点 |
| `nodes[].level` | number | 分层布局 |
| `nodes[].isTarget` | boolean | 目标节点样式和资料空态 |
| `edges[]` | array | 绘制依赖线 |

特殊状态：

- `missingCount = 0` 且只有目标节点时，前端显示“所有前置知识都已掌握”。
- `complete` 当前兼任“提交完成”和“结果查询”，所以前端刷新结果页也要调用它。
- 因为它是 `POST`，真实接入时结果页恢复也必须带 CSRF。

### 7. 获取节点资料

`GET /api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources`

前端用途：

- 结果图中点击节点后打开资料侧栏。
- 同一个会话内可按 `nodeId` 缓存，避免重复请求。

成功返回：

```json
{
  "nodeId": "204",
  "nodeName": "矩阵运算",
  "reason": "Transformer 的注意力计算大量使用矩阵乘法。",
  "resourceStatus": "READY",
  "resources": [
    {
      "id": "501",
      "title": "矩阵乘法如何理解",
      "url": "https://www.zhihu.com/...",
      "summary": "文章摘要",
      "authorName": "作者名",
      "voteCount": 128
    }
  ]
}
```

资料状态：

| resourceStatus | 含义 | 前端展示 | 当前实现 |
| --- | --- | --- | --- |
| `PENDING` | 尚未搜索，建表默认值 | 应展示“资料仍在整理” | 未分支，落入 READY 分支渲染成零资料的正常态 |
| `READY` | 有资料 | 展示资料列表 | 已实现 |
| `EMPTY` | 搜索成功但没有资料 | 展示“暂时没有合适资料” | 已实现 |
| `FAILED` | 搜索失败 | 展示失败提示，可允许重试读取 | 已实现，带重试按钮 |
| `NOT_APPLICABLE` | 目标节点不搜索资料 | 展示目标说明 | 已实现 |

数据库 `V1__create_knowledge_steps_tables.sql` 的 `resource_status` 约束包含全部五个取值，默认 `PENDING`。前端类型和校验器已覆盖五个值，但 `ResourcesDrawer` 只分支了四个。

字段空值约定：

- `summary`、`authorName`、`voteCount` 可以为 `null`。
- `voteCount: null` 表示未知，不能按 0 展示。
- `resources` 最多 3 条，允许空数组。

## 五、统一错误与空态约定

### 1. 错误结构

后端业务错误统一返回：

```json
{
  "error": {
    "code": "INVALID_TARGET",
    "message": "目标长度应为1～100个字符。"
  }
}
```

前端 HTTP 层建议统一转换为：

```ts
new ApiError(status, error.code, error.message)
```

### 2. 常见错误码

| HTTP | code | 出现条件 | 前端处理 |
| ---: | --- | --- | --- |
| 400 | `INVALID_TARGET` | 创建目标为空、超长或请求体格式错误 | 首页表单错误提示 |
| 400 | `INVALID_ANSWER` | 答案枚举不合法 | 保留当前题，提示重选 |
| 401 | `UNAUTHORIZED` | 未登录或会话失效 | 引导重新登录；本地联调先调用 `auth/me` |
| 403 | `CSRF_INVALID` | 写请求缺少或携带错误 CSRF token | 重新调用 `auth/me` 获取 token 后提示重试 |
| 404 | `NOT_FOUND` | 任务、题目、节点不存在，或跨用户访问 | 停止轮询，展示不可访问 |
| 409 | `SESSION_NOT_READY` | 未生成完成就取题、答题或完成 | 回到等待页并继续轮询 |
| 409 | `ANSWERS_INCOMPLETE` | 未全部答完就完成 | 回到问卷页定位未答题 |
| 409 | `SESSION_NOT_COMPLETED` | 未完成答卷就取资料 | 回到问卷页或结果恢复流程 |
| 429 | `RATE_LIMITED` | 后端生成队列已满 | 首页提示稍后再试，不自动重放创建请求 |
| 500 | `INTERNAL_ERROR` | 未预期服务错误 | 通用失败提示，可手动重试 |

### 3. 空态和兜底

| 场景 | 后端返回 | 前端建议 |
| --- | --- | --- |
| 无前置知识 | `questions: []`，`complete` 返回目标节点 | 显示无需自评，允许查看结果 |
| 资料为空 | `resourceStatus: EMPTY`，`resources: []` | 展示空资料提示 |
| 资料搜索失败 | `resourceStatus: FAILED`，`resources: []` | 展示失败提示，不影响路径 |
| 目标节点资料 | `resourceStatus: NOT_APPLICABLE` | 展示目标说明，不请求外部链接 |
| 任务生成失败 | `status: FAILED`，`error` 有值 | 停止轮询，展示错误文案 |
| 网络超时 | 无业务 JSON | 转为 `NETWORK_ERROR` 或通用错误，允许重试 |

## 六、前端真实接入现状

本节原为接入建议，现已落地。以下记录实际实现，并标出与原建议的偏差。

### 1. HTTP 基础层

`frontend/src/api/http.ts` 已实现：

- 默认 `credentials: 'include'`，确保浏览器携带 Session Cookie。
- 默认 `Accept: application/json`。
- 有请求体时设置 `Content-Type: application/json`。
- 解析 `{ error: { code, message } }` 并抛出 `ApiError`；非 JSON 正文抛 `INVALID_RESPONSE`；fetch 抛错转 `NETWORK_ERROR`。
- 导出 `apiJson`（带响应校验）与 `apiVoid`（用于 204）。

与原建议的偏差：

- 未实现超时与取消。`X-CSRF-Token` 也不在此层自动附带，而是由 `real/sessions.ts` 的 `request` 包装按写请求逐个设置。
- 响应运行时校验拆到 `frontend/src/api/validators.ts`，由 `real/sessions.ts` 的 `parseXxx` 函数组合使用，结构异常统一转 `INVALID_RESPONSE`，页面不会白屏。

### 2. 认证 API

`frontend/src/api/auth.ts` 已实现，并在原建议之外补了并发去重与刷新入口：

```ts
interface CurrentUser {
  userId: string
  csrfToken: string
}

getCurrentUser(): Promise<CurrentUser>     // 每次都打 auth/me
ensureCurrentUser(): Promise<CurrentUser>  // 命中内存缓存，并发只发一次请求
refreshCurrentUser(): Promise<CurrentUser> // 清缓存后重取
getCsrfToken(): string | null
logout(): Promise<void>
refreshAfterCsrfFailure(error: unknown): Promise<void>
```

实际接入顺序：

1. 任何业务请求前由 `real/sessions.ts` 的 `request` 调用 `ensureCurrentUser()`，因此读请求也会先建立会话。
2. `csrfToken` 只存内存，不落 `localStorage`。
3. 写请求收到 403 `CSRF_INVALID` 时，`refreshAfterCsrfFailure` 刷新 token 后仍向上抛原错误，由页面提示用户重试，不自动重放。

### 3. sessions API 双模式

`frontend/src/api/sessions.ts` 保留原函数签名，按 `isMockMode` 转发到 Mock store 或 `real/sessions.ts`：

| 入口函数 | 真实接口 | 是否带 CSRF |
| --- | --- | --- |
| `createSession(target)` | `POST /api/v1/learning-sessions` | 是 |
| `getSession(sessionId)` | `GET /api/v1/learning-sessions/{sessionId}` | 否 |
| `getQuestions(sessionId)` | `GET /api/v1/learning-sessions/{sessionId}/questions` | 否 |
| `saveAnswer(sessionId, questionId, answer)` | `PUT /api/v1/learning-sessions/{sessionId}/answers/{questionId}` | 是 |
| `completeSession(sessionId)` | `POST /api/v1/learning-sessions/{sessionId}/complete` | 是 |
| `getNodeResources(sessionId, nodeId)` | `GET /api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources` | 否 |

页面层 import 未变。Path 参数统一 `encodeURIComponent`，ID 全程按字符串处理。`api` 模式下任何失败都不回退 Mock。

## 七、联调优先级

### 已关闭：原 P0 阻塞项

| 项目 | 结果 |
| --- | --- |
| `GET /api/v1/auth/me` 接入 | 已完成，`ensureCurrentUser` 在任何业务请求前建立会话并缓存 token |
| 六个 learning session 接口 | 已完成，`real/sessions.ts` 全部接入并带响应校验 |
| `warnings` 类型修正 | 已完成，类型与校验器均为对象数组 |
| `complete` 结果页恢复 | 已完成，结果页 COMPLETED 时重新调用 `complete` 并带 CSRF |
| 统一错误解析 | 已完成，统一抛 `ApiError(status, code, message)` |

### P0：仍阻塞真实链路验收

| 项目 | 原因 |
| --- | --- |
| 补齐 `backend/secrets.properties` 凭证 | 缺模型与检索密钥时任务稳定失败为 `GRAPH_GENERATION_FAILED`，走不到结果页 |
| 请求超时与 AbortController | 切换 sessionId 时旧请求仍在飞；慢响应无上限等待 |
| 错误重试有限退避 | 网络错误与 5xx 当前固定 2000ms 无上限重试，后端异常时前端持续压请求 |
| 401 明确引导 | 现在只展示后端原始 message，用户无法区分未登录与 `local-test` 未启用 |
| Vercel SPA fallback | 生产刷新 `/sessions/{id}/result` 会 404 |

### P1：影响生产体验

| 项目 | 原因 |
| --- | --- |
| 知乎 OAuth 登录/回调 | 普通配置下没有自动身份，生产不可只靠 `local-test` |
| 服务端答题计数校准 | `saveAnswer` 返回的 `answeredCount` / `totalQuestions` 被丢弃，与后端口径可能漂移 |
| `warnings` 展示入口 | 字段已解析但未渲染，资料搜索失败对用户不可见 |
| `resourceStatus: PENDING` 分支 | 当前落入 READY 分支，渲染成零资料的正常态 |
| 429 `Retry-After` 读取 | 现在只展示错误文案，不遵循服务端等待时间 |
| 资料侧栏 409/404 分流 | 两者都显示“资料加载失败”，用户拿不到可操作信息 |
| 依赖版本锁定 | `package.json` 多项为 `latest`，构建不可复现 |

### P2：可后补优化

| 项目 | 原因 |
| --- | --- |
| `logout` 页面入口 | 函数已实现，但页面还没有用户菜单 |
| 独立 `GET result` 接口 | 现阶段 `POST complete` 可幂等恢复结果 |
| 节点资料前端缓存 | 当前靠 `key={node.id}` 每次重新请求；加缓存需同时设计失效 |
| 更细的 warning 展示 | 初期可只显示 warning 数量或消息 |

## 八、待确认问题

1. 生产登录是否必须在本轮完成 OAuth，还是先以 `local-test` 完成前后端主流程演示。
2. 结果页刷新是否接受继续使用 `POST complete`，还是希望后端新增只读 `GET /api/v1/learning-sessions/{sessionId}/result`。当前已按 `complete` 实现。
3. `warnings` 前端是否展示为完整列表，还是只在等待页或结果页展示“部分资料搜索失败”。字段已解析，展示形式待定。
4. 任务状态是否需要展示创建时间、完成时间或更细进度；当前后端未返回时间字段。
5. `SESSION_NOT_READY` 出现在问卷页时，前端是自动回等待页继续轮询，还是显示手动刷新按钮。当前实现落在第三种行为上：`getQuestions` 报错即显示“问卷没有加载成功”和回首页按钮，既不继续轮询也没有就地重试，需要定夺后修正。
6. 可见节点是否可能返回 `resourceStatus: PENDING`。若后端保证不会，前端可只补一个防御分支；若会，需要设计“资料仍在整理”的文案与轮询策略。

## 九、当前对齐结论

七个 P0 接口已全部接入，前端不再依赖 Mock 才能运行。API 层工作基本完成，剩余风险从"接口能不能通"转移到"异常路径是否可控"：

已完成：

- `auth/me` 初始化与 CSRF token 内存管理，写请求统一带 header，`CSRF_INVALID` 刷新但不重放。
- `sessions.ts` 按 `VITE_DATA_MODE` 双模式转发，六个业务接口带逐字段响应校验。
- `warnings` 字段类型修正。
- 创建任务不自动重试，状态查询固定 2000ms 轮询且终态停止。
- 结果页用 `complete` 幂等恢复结果。

仍需关注：

- 缺少真实模型与检索凭证，完整链路尚未跑到结果页；这是当前唯一挡住 M4 手动验收的外部依赖。
- 请求层没有超时与取消，错误重试没有退避上限，429 不遵循 `Retry-After`。
- 答题进度以前端计数为准，未用服务端返回校准。
- `warnings` 与 `resourceStatus: PENDING` 有数据无出口。
- 生产部署缺 SPA fallback，依赖版本未锁定，仍无自动化测试。

页面层结构不需要再改动即可联调；下一阶段重点是异常路径与交付工程化，详见 [前端接口对接 TODO](FRONTEND_API_TODO.md) 的 M6。
