# API 约定

> 创建任务、查询状态、答卷读取、答案保存及当前用户接口已实现；结果、节点资料及 OAuth 登录仍待实现。数据库字段见 [数据库设计](DATABASE_DESIGN.md)。

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

前四个接口已实现，其余两个为待实现约定；健康检查状态见文末。

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

失败：400 `INVALID_TARGET`（空白、超长或请求体格式错误），401 `UNAUTHORIZED`，403 `CSRF_INVALID`，429 `RATE_LIMITED`。按钮提交期间禁用；重新创建属于新任务。

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

进度数表示已处理前置节点数，搜索结束后保留最终计数，未生成节点时 totalNodes 为 0。单节点搜索失败放入 warnings，继续生成答卷。模型生成失败时本接口仍返回 200，但 status 为 FAILED，error 为错误对象，例如：

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

### 知乎 OAuth 原理图（接入设计）

![知阶与知乎 OAuth 授权码登录流程](../images/OAuth原理图.png)

浏览器负责跳转及用户授权，知阶后端负责交换令牌、查询知乎身份并建立自己的登录会话；数据库用知乎稳定用户标识关联内部 users.id。OAuth 当前仍在申请，图中登录和回调流程尚未实现。

依据已提供的知乎接入说明，授权地址为 `https://openapi.zhihu.com/authorize`；回调参数名为 `authorization_code`。换令牌请求为 `POST https://openapi.zhihu.com/access_token`，使用 `application/x-www-form-urlencoded` 提交 app_id、app_key、grant_type=authorization_code、redirect_uri 及 code（值取自回调的 authorization_code）。app_key 和 access_token 不返回浏览器。

用户信息接口、稳定身份字段、state 参数支持与回传，以及 localhost 回调是否允许，仍需知乎确认。申请公开内容权限后，收藏夹推荐也需单独对接相应接口；不能据此假设能读取私密收藏夹。搜索 Access Secret 与 OAuth 应用凭证、用户令牌用途不同，不能互相替代。

### 当前身份接入与本地调试

`GET /api/v1/auth/me` 已实现，成功返回 `{"userId":"1","csrfToken":"会话绑定的随机令牌"}`，同时建立会话 Cookie；普通配置下没有登录会话返回 401。OAuth 回调尚未实现，普通配置不会自行获得登录身份。

认证代码集中在 `com.zhihu.hackathon.auth` 模块（Java 包，尚未拆成独立 Maven 工程），不依赖学习任务模块。`CurrentUserProvider` 是业务读取身份的入口；`AuthUserStore` 隔离用户存储，`SessionAuthentication` 负责会话生命周期，`CsrfTokens` 负责写请求校验，`AuthException` 及其处理器统一返回 401/403。

普通配置从服务器会话的 `knowledgeSteps.userId` 读取内部用户 ID，并确认该用户仍存在且不是 local-test: 测试身份。OAuth 后续完成授权验证、令牌交换、用户信息查询和用户落库后，再调用 `SessionAuthentication.establish`：旧会话失效，新会话与 CSRF 令牌重新生成，避免沿用登录前会话。该方法不对浏览器提供设置用户 ID 的接口。

local-test 配置创建固定测试用户，每个进程第一次读取身份时初始化一次，后续轮询不重复写 users 表。名称由服务器配置 `learning.local-user` 决定（默认 developer），不能从请求头或参数切换。此模式仍是开发身份旁路，禁止在正式环境启用。

`GET /api/v1/auth/me` 的成功和认证失败响应包含 `Cache-Control: no-store`。会话空闲超时 30 分钟，只接受 Cookie 会话跟踪，Cookie 设置 HttpOnly、SameSite=Lax；本地 HTTP 默认 Secure=false，生产 HTTPS 必须设置 `SESSION_COOKIE_SECURE=true`。

`POST /api/v1/auth/logout` 已实现：携带会话 Cookie 和 X-CSRF-Token，无请求体；成功返回 204，无响应体并使服务器会话失效。未登录返回 401，CSRF 校验失败返回 403，错误结构与其他认证接口一致。local-test 下退出只销毁当前 Cookie 会话，再次访问 auth/me 仍会按固定测试身份创建新会话；正式登录不会自动恢复身份。

Apifox 调试顺序：

1. 在 backend 目录启用 local-test 启动后端，默认端口 8080。
2. GET `/api/v1/auth/me`，保留 Cookie，复制响应中的 csrfToken。
3. POST `/api/v1/learning-sessions`，Headers 添加 `X-CSRF-Token`，JSON 为 `{"target":"Transformer"}`。
4. 每两秒 GET `/api/v1/learning-sessions/{sessionId}`；到 READY 或 FAILED 停止。READY 表示节点、依赖、资料状态和完整题目已保存，答卷读取接口仍待实现。

缺少或错误 CSRF 令牌：403 `{"error":{"code":"CSRF_INVALID","message":"请刷新页面获取有效令牌。"}}`。跨用户访问或非法任务编号：404 `{"error":{"code":"NOT_FOUND","message":"任务不存在。"}}`。额外 userId 字段不参与身份判断。

当前使用一个工作线程、最多八个排队任务；队列已满时在创建记录之前返回 429 `{"error":{"code":"RATE_LIMITED","message":"生成任务繁忙，请稍后重试。"}}`，响应头 Retry-After: 5。此限制是单实例全局容量控制，尚未实现每用户时间窗口限流。

### 生成职责划分

GraphGenerator、QuestionGenerator、ResourceSearch 为上游端口，SessionStore 为存储端口；GenerationPipeline 负责步骤编排，GraphValidator 只做纯数据校验。默认使用硅基流动实现两个模型端口，读取 model.graph-model 和 model.question-model；网络请求与数据库短事务分离。更换供应商不需要修改 Controller 或 JDBC 存储。

模型 A 输出 `{"nodes":[{"key":"n1","name":"矩阵运算","description":"用途"}],"edges":[{"from":"n1","to":"target"}]}`；nodes 仅含前置节点，目标由后端加入。拒绝超量、规范化重名、未知引用、重复边、自环、循环、目标出边和无法到达目标的节点，按最长依赖路径分层。

模型 B 输出 `{"questions":[{"nodeId":"数据库节点ID","questionText":"自评问题","hint":"用途"}]}`，必须恰好覆盖全部前置节点。空前置图跳过搜索与模型 B，保存目标后进入 READY。搜索失败的 warnings 元素为 `{"nodeId":"节点ID","code":"RESOURCE_SEARCH_FAILED","message":"该节点资料搜索失败。"}`。

模型使用 JSON Object 模式，不保证上游严格遵循 JSON Schema；本地拒绝未知字段、重复 JSON 属性、尾随数据、截断和非法结构，语义质量仍需人工验收。模型不自动重试，失败码为 GRAPH_GENERATION_FAILED 或 QUESTION_GENERATION_FAILED。重启时将未完成任务标记为 FAILED / GENERATION_INTERRUPTED，保留已存数据。

2026-09-09 验证：Java 21 完整 verify 的 49 项测试全部通过；独立测试库中真实 Transformer 任务到达 READY，保存 10 个前置节点、1 个目标、10 条依赖、30 条知乎资料及10道自评题，warnings 为空，外键检查无错误。该结果验证生成链路，不表示 OAuth 或剩余四个业务接口已完成。

OAuth 尚待实现的接口为 `GET /api/v1/auth/zhihu/login`（跳转授权）和 `GET /api/v1/auth/zhihu/callback`（校验授权响应、换取身份、建立会话）。除 app_id/app_key 外，还需确认用户信息接口、稳定 ID 字段、state 回传及回调白名单；接入时应实现授权事务有效期、一次性消费与拒绝重复回调、上游超时和错误脱敏。PKCE 是否可用需官方确认，不能假定支持。返回站内页面应使用固定或白名单地址，不接受任意跳转 URL。

认证模块回归：Java 21 verify 共 55 项测试通过，新增覆盖会话与 CSRF 轮换、跨会话 CSRF 拒绝、无效用户、测试用户单次初始化、退出与禁止缓存。此结果不表示 OAuth 授权码交换已经完成。

模型 A 输入目标，输出稳定临时节点标识、名称、描述、依赖边；由后端分配数据库 ID。模型 B 输入已校验节点及数据库 ID，为每个前置节点输出一道题目和提示。后端校验题目覆盖完整且不重复。

知乎搜索在后端执行，每个前置节点独立请求、限并发、超时控制，限次重试；返回结果以 node_id 绑定并缓存。所有节点处理完毕后再生成答卷，符合当前产品流程。具体上游参数和额度以赛事官方文档为准。

已根据团队提供的接口说明添加 `ZhihuSearchClient`，已接入生成流程，并已通过真实请求验证：GET `https://developer.zhihu.com/api/v1/content/zhihu_search`，Query 和 Count 参数区分大小写，客户端请求 Count=3；发送 Bearer 凭证、秒级 X-Request-Timestamp 和 application/json。凭证读取后端 `ZHIHU_ACCESS_SECRET`。响应 Code=0 时读取 Data.Items，将 Title、Url、ContentText、AuthorName、VoteUpCount 映射到资料字段，保留 Url 的 UTM 参数；缺失赞同数返回 null。空数组表示无结果，结构异常或上游错误不能当作空搜索成功。

客户端连接超时 5 秒、读取超时 15 秒，不跟随重定向，不在异常中携带上游正文或凭证。生成任务串行执行，每个前置节点最多搜索两次（只有可重试错误才重试，间隔1秒），结果按节点持久化；单节点最终失败保存 FAILED，继续出题，不建立跨用户缓存。

每个接口改动都要在 PR 中更新本文件，并提供请求、成功响应和失败响应示例。

## 当前基础接口

### 本地上游测试接口（已实现）

仅启用 `local-test` 配置时开放，默认仅监听 127.0.0.1。无需登录，不用于部署或正式业务；不写入业务数据，不自动重试。凭证读取 `backend/secrets.properties`，不通过请求传入。

在 backend 目录启动：

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local-test"
```

IDEA 也可仅为本地测试把有效配置文件设为 `local-test`（不是目录），工作目录仍为 `$PROJECT_DIR$/backend`。普通启动保持有效配置文件为空，不注册这两个接口。

| 方法 | 路径 | 请求 | 成功响应 |
| --- | --- | --- | --- |
| GET | `/api/test/zhihu/search?query=Transformer` | query 去空白后 1～100 字符 | `{"resources":[...]}`，最多 3 条真实资料，字段为 title、url、summary、authorName、voteCount |
| POST | `/api/test/ai` | `{"prompt":"用一句话解释 Transformer"}`，prompt 去空白后 1～2000 字符 | `{"model":"deepseek-ai/DeepSeek-V4-Flash","content":"模型实际生成的文本"}` |

AI 使用 model.base-url、model.api-key 和 model.graph-model；当前 A、B 配置相同。非流式调用 `/chat/completions`，最大输出 1024 Token，读取超时 60 秒。此接口只测试文本生成，不承诺业务 JSON 结构。返回达到长度上限时报告 AI_OUTPUT_TRUNCATED。

失败响应示例：400 `{"error":{"code":"INVALID_INPUT"}}`；缺失密钥返回 503；上游失败返回 502 和脱敏代码（例如 AI_UPSTREAM_HTTP_401、AI_REQUEST_FAILED、ZHIHU_AUTH_FAILED），不返回上游错误正文。

2026-09-08 实测：Java 21 完整 verify 通过，现有 12 项测试全部通过；独立测试数据库下，知乎测试接口 HTTP 200 返回 3 条资料，硅基流动测试接口 HTTP 200 返回非空文本；空 prompt、空 query 均返回 400。未修改实际业务数据库。

| 接口 | 用途 | 状态 |
| --- | --- | --- |
| `GET /actuator/health` | 部署后健康检查 | 已实现 |

## 数据边界

- 知乎 OAuth Token、Access Secret 和模型密钥只在后端环境变量中使用，不能返回给浏览器。
- 查询学习记录必须同时使用当前用户标识和记录 ID；不能只按记录 ID 查询。
- 未完成 OAuth 接入前，不得用开发者账户的数据冒充登录用户的数据。
