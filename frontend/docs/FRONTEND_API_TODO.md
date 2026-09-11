# 前端接口对接 TODO

本文档用于跟踪前端从 Mock 演示切换到真实后端接口的实施任务。当前决策为混合推进：先建立最小 HTTP 层、认证与类型修正，再按 `VITE_DATA_MODE=mock|api` 逐步替换 Mock；首轮验收以本地后端 `local-test` 跑通完整主链路为准。

关联文档：

- [前端建设规划书](FRONTEND_PLAN.md)
- [前端视角接口对齐分析](FRONTEND_API_ALIGNMENT.md)
- [API 约定](../../docs/API_CONTRACT.md)

## 一、执行原则

- `frontend/src/api/sessions.ts` 继续作为页面唯一调用入口，页面不直接关心 Mock 或真实实现。
- 保留 Mock 模式用于开发演示和异常态构造；真实接口失败时禁止静默回退 Mock。
- API 模式下第一次任意业务请求前先调用 `GET /api/v1/auth/me`，建立 Cookie 会话并获取 CSRF token。
- 写请求统一携带 `X-CSRF-Token`；遇到 `CSRF_INVALID` 时刷新 token，但不自动重放原写请求。
- 结果页刷新继续调用 `POST /api/v1/learning-sessions/{sessionId}/complete` 幂等恢复结果。
- 第一轮不引入测试框架；完成标准是本地真实后端 `local-test` 手动跑通主链路。

## 二、阶段任务

### M0：文档与基线校准

目标：消除接口状态口径不一致，明确首轮只做接口接入，不混入大范围页面重构。

文件级任务：

- [x] 新增本文档，记录阶段、文件任务、验收项和后续页面修复批次。
- [x] 修正 `docs/API_CONTRACT.md` 中关于答卷读取、剩余业务接口待实现的旧描述。
- [x] 修正 `docs/DATABASE_DESIGN.md` 中关于答案与最终结果仍待实现的旧描述。
- [x] 修正 `docs/FRONTEND.md` 和 `docs/FRONTEND_PLAN.md` 中关于六个业务接口未实现的旧描述。
- [x] 保留 OAuth 未实现、生产登录仍待接入的说明。

验收项：

- [x] 文档一致说明：六个 learning session 业务接口已由后端实现，前端尚未接入真实 HTTP。
- [x] 文档一致说明：认证已有 `auth/me` 与 `logout`，知乎 OAuth 登录和回调仍未实现。
- [x] 文档一致说明：前端第一阶段通过 `local-test` 身份联调。

### M1：类型、配置与 HTTP 基础层

目标：让前端具备真实请求能力，同时保持 Mock 模式可用。

文件级任务：

- [x] 修改 `frontend/src/api/types.ts`：把 `SessionDetail.warnings` 从 `string[]` 改为 `SessionWarning[]`。
- [x] 在 `frontend/src/api/types.ts` 增加 `CurrentUser`、`ApiErrorBody` 等请求层需要的类型。
- [x] 新增 `frontend/src/api/config.ts`：
  - [x] 读取 `VITE_DATA_MODE`，只允许 `mock` 或 `api`。
  - [x] 读取可选 `VITE_API_BASE_URL`。
  - [x] 默认开发模式可继续使用 Mock；真实联调必须显式设置 `api`。
- [x] 新增 `frontend/src/api/http.ts`：
  - [x] 默认 `credentials: 'include'`。
  - [x] 统一 JSON 请求与响应解析。
  - [x] 统一解析 `{ error: { code, message } }` 并抛出 `ApiError`。
  - [x] 对关键响应字段做轻量运行时校验；结构异常抛 `INVALID_RESPONSE`。
  - [x] 写请求自动带 `X-CSRF-Token`。
  - [x] `CSRF_INVALID` 时刷新 token，但不自动重放原请求。
- [x] 新增 `frontend/src/api/auth.ts`：
  - [x] `getCurrentUser(): Promise<CurrentUser>` 调用 `GET /api/v1/auth/me`。
  - [x] `logout(): Promise<void>` 调用 `POST /api/v1/auth/logout`。
  - [x] 在内存缓存当前 CSRF token。
  - [x] API 模式下 401 明确失败，不切回 Mock。

验收项：

- [x] `mock` 模式下现有代码可构建，公共页面入口仍走 `frontend/src/api/sessions.ts`。
- [ ] `api` 模式下未启动或未启用 `local-test` 的后端时，错误明确显示为真实接口不可用或未登录。
- [x] 写请求没有 token 时会先尝试 `auth/me`，不会直接裸发业务写请求。

### M2：真实 sessions API 接入

目标：六个业务函数支持 `mock|api` 双模式，页面调用签名保持不变。

文件级任务：

- [x] 新增 `frontend/src/api/real/sessions.ts`。
- [x] 实现 `createSession(target)` -> `POST /api/v1/learning-sessions`。
- [x] 实现 `getSession(sessionId)` -> `GET /api/v1/learning-sessions/{sessionId}`。
- [x] 实现 `getQuestions(sessionId)` -> `GET /api/v1/learning-sessions/{sessionId}/questions`。
- [x] 实现 `saveAnswer(sessionId, questionId, answer)` -> `PUT /api/v1/learning-sessions/{sessionId}/answers/{questionId}`。
- [x] 实现 `completeSession(sessionId)` -> `POST /api/v1/learning-sessions/{sessionId}/complete`。
- [x] 实现 `getNodeResources(sessionId, nodeId)` -> `GET /api/v1/learning-sessions/{sessionId}/nodes/{nodeId}/resources`。
- [x] 改造 `frontend/src/api/sessions.ts`：根据 `VITE_DATA_MODE` 转发到 Mock 或 real 实现。
- [x] 创建任务请求不自动重试，避免重复创建会话。
- [x] 结果恢复请求允许重复调用，但仍需与答案保存串行。

验收项：

- [x] 页面层 import 不需要变化。
- [x] ID 全程按字符串处理。
- [x] 错误统一抛 `ApiError(status, code, message)`。
- [ ] 真实接口返回结构异常时不会白屏，而是进入可理解的错误态。

### M3：真实模式文案与错误体验

目标：避免 API 模式下仍展示 Mock 文案，并保证主要错误能被用户理解。

文件级任务：

- [x] 新增一个轻量模式判断工具，页面可读取当前是否为 Mock。
- [x] `HomePage.tsx`：`api` 模式下移除“Mock 演示说明”和本地模拟提示。
- [x] `SessionQuestionsPage.tsx`：`api` 模式下 toolbar 不显示“Mock 演示”。
- [x] `SessionResultPage.tsx`：`api` 模式下 toolbar 不显示“Mock 演示”。
- [x] `WaitingView.tsx`：`api` 模式下不显示“本页面为 Mock 演示”。
- [x] `ResourcesDrawer.tsx`：`api` 模式下不显示“以下为本地 Mock 资料”和“演示数据”徽标。
- [x] `useSession.ts`：确认 401、403、404 停止空转轮询；网络和 5xx 可继续有限重试或手动重试。

验收项：

- [x] `mock` 模式明确标注演示数据。
- [x] `api` 模式不出现 Mock 字样。
- [ ] 401 显示未登录或 local-test 未启用的明确提示。
- [x] 403 CSRF 错误不会自动重放写请求。
- [x] 404 停止轮询并提示任务不存在或无权访问。

### M4：本地 `local-test` 主链路验收

目标：用真实后端证明六接口闭环可用。

后端启动建议：

```powershell
cd backend
$env:JAVA_HOME="C:\Program Files\Java\jdk-21"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local-test"
```

前端启动建议：

```powershell
cd frontend
$env:VITE_DATA_MODE="api"
npm run dev
```

手动验收步骤：

- [x] API 模式前端开发服务可启动并返回首页资源。
- [ ] 输入 `Transformer`，点击开始寻路。
- [x] 通过 Vite 代理调用 `GET /api/v1/auth/me` 并获得 CSRF token。
- [x] 通过 Vite 代理创建任务成功，拿到 `sessionId`。
- [x] 直接后端接口与 Vite 代理均可查询 `GET /api/v1/learning-sessions/{sessionId}`。
- [ ] 状态到 `READY` 后读取 questions。
- [ ] 逐题保存答案，确认 `PUT answers` 成功。
- [ ] 全部答完后调用 `POST complete`，进入结果页。
- [ ] 刷新结果页，确认再次调用 `POST complete` 恢复 nodes/edges。
- [ ] 点击一个可见前置节点，确认资料侧栏调用 resources 并展示真实字段。
- [ ] 点击目标节点，确认 `NOT_APPLICABLE` 空态文案正确。

失败态抽查：

- [x] 去掉 CSRF token，写请求返回 `403/CSRF_INVALID`。
- [x] 访问不存在的 sessionId，后端返回 `404/NOT_FOUND`，前端轮询逻辑会停止重试。
- [ ] 后端未启用 `local-test` 时，`auth/me` 401 不回退 Mock。

完成标志：

- [x] `npm run typecheck` 通过。
- [x] `npm run lint` 通过。
- [x] `npm run build` 通过。
- [x] `VITE_DATA_MODE=api npm run build` 通过。
- [x] 后端 `SessionIntegrationTest`、`AuthModuleTest` 通过，验证认证、CSRF、questions、answers、complete、resources 的后端合同闭环。
- [x] 本地 `local-test` 真实 HTTP 烟测重复 3 轮，认证、CSRF、创建、详情、404、logout 行为稳定。
- [ ] API 模式完整真实链路走到结果页并能打开节点资料。

### 2026-09-10 本地联调记录

环境：

- 后端使用 JDK 21 启动 `local-test`：`.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local-test"`。
- 前端使用 `VITE_DATA_MODE=api` 启动 Vite，实际端口为 `http://127.0.0.1:5174/`，`/api` 通过 Vite proxy 转发到 `http://localhost:8080`。
- 当前仓库只有 `backend/secrets.properties.example`，没有 `backend/secrets.properties`，因此本地真实生成缺少 `model.api-key` 等配置。

已完成验证：

- 直接访问后端重复 3 轮：
  - `GET /actuator/health` 返回 200。
  - `GET /api/v1/auth/me` 返回 200，`userId=1`，CSRF token 长度 36。
  - 不带 `X-CSRF-Token` 调用 `POST /api/v1/learning-sessions` 返回 `403/CSRF_INVALID`。
  - 带 CSRF 调用 `POST /api/v1/learning-sessions` 返回 `202/GENERATING_GRAPH`，成功获得 `sessionId`。
  - 轮询 `GET /api/v1/learning-sessions/{sessionId}` 后均进入 `FAILED`，错误码为 `GRAPH_GENERATION_FAILED`。
- 通过前端 Vite 代理验证：
  - 首页资源返回 200。
  - `GET /api/v1/auth/me` 返回 200。
  - `POST /api/v1/learning-sessions` 返回 `202/GENERATING_GRAPH`。
  - `GET /api/v1/learning-sessions/{sessionId}` 返回 200，最终状态为 `FAILED`，错误码为 `GRAPH_GENERATION_FAILED`。
- 失败态补充验证：
  - `GET /api/v1/learning-sessions/999999999999` 返回 `404/NOT_FOUND`。
  - 不带 CSRF 调用 `POST /api/v1/auth/logout` 返回 `403/CSRF_INVALID`。
  - 带 CSRF 调用 `POST /api/v1/auth/logout` 返回 204。
- 后端合同测试：
  - `AuthModuleTest`：6 个测试通过。
  - `SessionIntegrationTest`：22 个测试通过。

结论：

- 前端最小 HTTP 层、CSRF 获取、API 模式构建、Vite 代理到后端、后端认证与会话创建均已验证通过。
- 当前不能完成“API 模式真实链路走到结果页并打开节点资料”，原因是本地缺少 `backend/secrets.properties` 中的真实模型和检索配置，任务生成会稳定失败为 `GRAPH_GENERATION_FAILED`。
- 后端集成测试已用 mock model/search 覆盖 READY、答题、完成和资料接口闭环；补齐本地密钥后，应重新执行 M4 中从首页点击到结果页资料侧栏的完整手动验收。

### M5：第二阶段页面挡路修复

目标：接口接通后集中修复当前规划书中的 P0 页面行为问题。

任务清单：

- [x] 修复问卷复核：`SessionQuestionsPage` 用独立 `reviewing` 状态与 `allAnswered` 解耦，全部答完后从 `StatusRail` 点任意已答题可打开 `QuestionPanel` 修改。
- [x] 修复零题目：`allAnswered` 改为 `questions !== null && answeredCount === totalQuestions`，`[]` 与 `null` 分开处理，零题目直接显示“无需额外确认”并可 complete。
- [x] 修复结果图：`PathView` 消费 `result.edges`，按节点实测位置绘制 SVG 贝塞尔连线，并补 `path-dependencies` 文字依赖列表。
- [x] 修复全掌握结果：`missingCount === 0 && nodes.length === 1` 走 `all-clear` 分支，只展示目标节点并说明不为目标搜索资料。
- [x] 修复资料侧栏：`ResourcesDrawer` 已按 `resourceStatus` 分支渲染 READY/EMPTY/FAILED/NOT_APPLICABLE，作者与赞同数按 null 区分“暂未提供”，不用 0 冒充未知。
- [~] 清理轮询策略：`useSession` 已固定 2000ms、上一请求完成后再排下一次、终态停止、401/403/404 停止重试；仍缺有限退避与 AbortController，见 M6。

验收项：

- [x] Mock 与 API 模式行为一致，只在数据来源和演示标识上不同。
- [x] 并行分支和跨层边不会被误画成单链；`visibleEdges` 过滤悬空边。
- [x] 零题目、全部掌握、资料失败不会白屏或无限加载。
- [~] 从结果页返回修改答案后旧结果失效；当前资料侧栏没有缓存层，靠 `key={node.id}` 每次重新请求，缓存失效议题随 M6 缓存实现一并处理。

### M6：真实模式遗留逻辑项

目标：收敛 M1～M5 留下的、已在代码中确认存在的偏差。按阻塞程度排序。

阻塞真实链路验收：

- [ ] 补齐 `backend/secrets.properties` 的 `model.api-key` 与知乎检索凭证，否则任务稳定失败为 `GRAPH_GENERATION_FAILED`，M4 手动验收无法继续。

契约与代码不一致：

- [ ] `ResourceStatus` 代码与数据库有 5 个取值，`PENDING` 在 `ResourcesDrawer` 里落入 READY 分支，会渲染成“有 reason、零资料”的正常态。需要补 PENDING 独立文案，或由后端保证可见节点不返回 PENDING。
- [ ] `saveAnswer` 返回的 `masteryStatus`、`answeredCount`、`totalQuestions` 当前被丢弃，页面用本地数组自行计数。应改为以服务端返回校准，避免与后端口径漂移。
- [ ] `SessionDetail.warnings` 已解析但全站没有任何渲染入口。等待页或结果页需要一处“部分资料暂不可用”的非阻断提示。

请求层能力缺口：

- [ ] `http.ts` 没有超时与 AbortController；`useSession` 只用 `cancelled` 标志忽略响应，实际请求不会中断。需要补请求取消与超时。
- [ ] 网络错误与 5xx 当前是固定 2000ms 无上限重试，未实现规划书约定的 2/4/8 秒有限退避与手动重试出口。
- [ ] 429 `RATE_LIMITED` 的 `Retry-After` 响应头没有读取，首页只展示错误文案。

体验与部署：

- [ ] 401 只展示后端原始 message，没有“未登录或 local-test 未启用”的明确引导与登录入口。
- [ ] `ResourcesDrawer` 对 409 `SESSION_NOT_COMPLETED` 与 404 统一显示“资料加载失败”，未按状态分流。
- [ ] 仓库仍缺 Vercel SPA fallback 配置文件，生产刷新子路由会 404。
- [ ] `frontend/package.json` 中 React、Vite、TypeScript 等仍为 `latest`，构建不可复现。

验收项：

- [ ] 真实链路从首页走到结果页并打开节点资料成功。
- [ ] 断网后重试次数有限，恢复后可手动继续；切换 sessionId 时旧请求被取消。
- [ ] 答题进度与后端 `answeredCount` / `totalQuestions` 始终一致。
- [ ] 生产构建刷新 `/sessions/{id}/result` 不出现 404。

## 三、首轮涉及文件清单

| 文件 | 动作 | 阶段 |
| --- | --- | --- |
| `docs/FRONTEND_API_TODO.md` | 新增执行清单 | M0 |
| `docs/API_CONTRACT.md` | 修正旧接口状态描述 | M0 |
| `docs/DATABASE_DESIGN.md` | 修正实现进展描述 | M0 |
| `docs/FRONTEND.md` | 修正真实接口状态和类型示例 | M0 |
| `docs/FRONTEND_PLAN.md` | 修正差距表旧口径 | M0 |
| `frontend/src/api/types.ts` | 修正 warnings 类型，补认证类型 | M1 |
| `frontend/src/api/config.ts` | 新增模式和 API 地址配置 | M1 |
| `frontend/src/api/http.ts` | 新增 fetch 封装、CSRF、错误处理 | M1 |
| `frontend/src/api/auth.ts` | 新增当前用户和退出接口 | M1 |
| `frontend/src/api/real/sessions.ts` | 新增真实业务接口实现 | M2 |
| `frontend/src/api/sessions.ts` | 改为模式转发入口 | M2 |
| `frontend/src/pages/*`、`frontend/src/components/*` | 动态 Mock 文案和后续挡路交互修复 | M3、M5 |

## 四、暂不纳入首轮的事项

- 暂不实现知乎 OAuth 登录页面和回调流程，保留为 P1。
- 暂不新增独立 `GET result` 接口，继续使用 `POST complete` 幂等恢复。
- 暂不引入 Vitest、React Testing Library 或 Playwright；首轮以真实 `local-test` 手动验收为准。
- 暂不重构视觉体系和目录结构。
- 暂不做历史任务列表、用户中心、导出、分享或资料重新搜索接口。

## 五、风险提醒

- `api` 模式下任何静默回退 Mock 都会掩盖真实联调问题，禁止实现。
- `POST complete` 是结果恢复接口，也是写方法；结果页刷新同样需要 CSRF。
- `warnings` 后端返回对象数组，不是字符串数组；前端类型和展示要同步。
- `local-test` 会自动创建固定测试身份，不能代表生产 OAuth 已完成。
- 真实资料字段可能为 `null`，尤其是 `summary`、`authorName`、`voteCount`。
- 保存答案会使已完成任务回到 `READY`，前端必须清理旧结果和资料缓存。
