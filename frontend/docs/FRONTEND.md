# 知阶 KnowledgeSteps 前端技术方案

> 基于当前源码的差距盘点、分阶段任务与首版验收标准见 [前端建设规划书](FRONTEND_PLAN.md)（2026-09-10）。本文的方案描述不全部代表已完成实现。

> 定位：把产品 PRD（[PROJECT.md](../../docs/PROJECT.md)）与接口/数据契约（[API_CONTRACT.md](../../docs/API_CONTRACT.md)、[DATABASE_DESIGN.md](../../docs/DATABASE_DESIGN.md)）转化为“前端可直接执行”的实现方案。
>
> 本文档回答五个问题：页面怎么组织、模块怎么分、技术上依赖什么、状态怎么走、接口怎么接，并列出风险与待确认项。涉及工程协作与部署的约定放在附录。
>
> 视觉与交互统一基线见 [UI_DESIGN.md](UI_DESIGN.md)。当前前端已经具备可运行的 Mock 完整闭环，真实后端接口尚未接入。

## 一、需求理解

### 1.1 项目目标

知阶（Knowledge Steps）是面向“想学新知识但不知道缺什么”的学生与自学者的轻量知识寻路工具。核心承诺是：用户输入想学什么，系统推导出前置知识，通过少量自评确认用户基础，隐藏已掌握内容，最终给出可执行的待补齐路径，并让每个知识节点都能直接进入知乎资料学习。

一句话产品语感：“告诉我你想学什么，我只告诉你还缺什么。”

### 1.2 目标用户与核心流程

目标用户：希望学习新知识、但不清楚前置要求的学生与自主学习者，例如想学 Transformer、RAG、Spring Boot 但不确定从哪开始的用户。

核心用户流程：

```text
输入目标
  → 创建寻路任务（异步）
  → 生成前置知识依赖
  → 为每个前置节点搜索知乎资料
  → 生成自评问卷
  → 用户逐题自评
  → 隐藏已掌握节点、精简依赖
  → 展示待补齐路径与资料
```

### 1.3 页面范围

本期只有 3 个页面 + 1 个资料侧栏，不设置打卡、学习时长或个人 Dashboard。

| 页面 | 目的 | 关键出口 |
| --- | --- | --- |
| 首页 | 让用户明确“我想学什么” | 创建任务后进入问答流程 |
| 问答页 | 识别已有基础 | 完成全部题目后提交答卷 |
| 结果页 | 展示“还差哪几步” | 点击节点打开资料，可回去改判断或重新寻路 |
| 资料侧栏 | 让节点变成可立即使用的学习入口 | 新标签页打开知乎原文 |

### 1.4 本期功能边界

本期必须做：

- 首页目标输入、热门知识快捷入口、提交禁用与失败重试。
- 生成过程状态展示（含进度提示），失败时给出可读原因与重试入口。
- 按题目顺序逐题自评，支持返回上一题修改答案并更新后续判断。
- 右侧轻量状态列表：已掌握、待补齐、正在确认、尚未确认。
- 结果页分层展示待补齐路径，保留并行分支，不强行线性化。
- 结果页点击节点打开资料侧栏，区分资料就绪、无资料、搜索失败、目标不适用四种情况。
- 页面刷新后可通过任务编号恢复进度。

本期明确不做（非目标）：

- 不做打卡、学习时长、个人 Dashboard 与历史记录回顾页面。
- 不展示能力分数、准备度百分比，也不包装成严格能力测评。
- 目标节点不出题、第一版不搜索目标资料（NOT_APPLICABLE）。
- “听说过”和“不了解”不追加确认题，直接记为需要补齐。
- 不为追求美观引入复杂图编辑能力；路径渲染满足“可读、可点、不误导”即可。
- 移动端只保证基础可用，不做移动端专项设计。

### 1.5 对前端实现有约束力的产品原则

1. **服务端是权威**：已掌握节点只是从展示中隐藏，不物理删除；前端不要自行发明“删除已掌握节点”的逻辑。
2. **判断依据是自评**：所有“掌握/待补齐”结论都来自答案与服务端状态，前端不得另算分数。
3. **不制造虚假内容**：知乎资料为空或失败时如实展示，不生成假的链接、作者或赞同数。
4. **数量口径要准确**：“待补齐数量”不含目标节点，结果文案不能把目标数进缺口。
5. **一次寻路是一次会话**：重新输入目标是创建新任务，不是覆盖旧任务。

## 二、页面与模块架构

### 2.1 五层模块划分

从实现角度把前端拆成五个层次，职责自下而上、依赖单向：

```text
页面层      首页、问答页（含生成等待视图）、结果页
业务组件层  目标输入、问卷卡片、路径图、资料侧栏、状态侧栏
状态层      轮询 Hook、会话状态机、答题进度、侧栏选中态
接口层      HTTP 客户端、会话接口、题目接口、结果接口、资料接口、Mock 实现
工具层      常量、类型、错误映射、时间/数字格式化、图布局工具
```

模块化的例子（对应本项目）：

- 首页模块：目标输入、热门知识列表、创建任务提交。
- 问卷模块：逐题展示、答案选择、返回上一题、进度侧栏。
- 路径结果模块：分层节点图、缺口摘要、返回修改、重新寻路。
- 资料模块：资料列表、空/失败/目标不适用状态、原文外链。
- 会话模块：轮询、恢复、状态门禁（什么状态能看什么页面）。
- 接口模块：类型化请求封装与 Mock 切换。

### 2.2 路由与页面组织

建议使用基于路径的路由，并把 sessionId 放进 URL，刷新后可恢复：

| 路径 | 页面 | 说明 |
| --- | --- | --- |
| `/` | HomePage | 目标输入与创建 |
| `/sessions/:sessionId/questions` | SessionQuestionsPage | 生成中显示等待视图，READY 后显示问卷 |
| `/sessions/:sessionId/result` | SessionResultPage | 已完成的结果页，未完成时引导去答卷 |
| `*` | NotFoundPage | 404 与越权访问兜底 |

路由选型理由：

- sessionId 放在 URL 里，刷新、分享、排查都自然；不依赖内存状态。
- 生成等待不单独占一个路由，而是问答路由下的“子视图”，减少路由跳转断层。
- 结果页不允许无结果直达：进入时先校验会话状态，READY 跳回问卷并提示，FAILED 显示失败页。
- 路由组件用懒加载拆分，首页与结果页不互相阻塞首屏。

### 2.3 页面结构草案

首页：

- 品牌区（Logo、名称、标语）。
- 目标输入框（trim 后 1～100 字）与“开始寻路”按钮。
- 热门知识快捷入口（点击回填输入框）。
- 提交中的禁用态与生成失败提示（保留用户输入）。

问答页：

- 生成等待视图：Spin + 阶段文案 + 搜索进度（processedNodes / totalNodes）。
- 问卷主区：问题文本、可选 hint、四个选项、上一步/下一步。
- 右侧状态侧栏：已掌握、待补齐、正在确认、尚未确认。
- 全部答完后出现“查看结果/完成答卷”入口。

结果页：

- 顶部结论：目标名称与“还需要补齐 N 个前置知识”。
- 中间路径图：按 level 分层展示可见节点与依赖边。
- 操作区：修改基础判断、重新输入目标。
- 点击节点打开右侧资料侧栏；全掌握场景只展示目标节点与开始学习提示。

资料侧栏（Drawer/Drawer 内层）：

- 节点名称、简要解释、学习它的原因。
- 知乎资料列表：标题、摘要、作者、赞同数、原文入口。
- 状态区分：READY 正常展示、EMPTY 无资料、FAILED 搜索失败、NOT_APPLICABLE 目标不适用。

### 2.4 建议目录结构

```text
frontend/src
├── api/
│   ├── types.ts             # 与 API 契约一致的 TS 类型（唯一来源）
│   ├── sessions.ts          # 页面可调用的会话/题目/答案/完成/资料接口
│   └── mock/
│       ├── specs.ts         # 预置知识图谱与主题
│       └── store.ts         # Mock 状态机、剪枝与 localStorage 持久化
├── components/
│   ├── layout/
│   │   └── AppShell.tsx     # 顶部导航、页脚、路由出口
│   ├── quiz/
│   │   ├── QuestionPanel.tsx
│   │   └── StatusRail.tsx
│   ├── result/
│   │   ├── PathView.tsx
│   │   └── ResourcesDrawer.tsx
│   └── waiting/
│       └── WaitingView.tsx
├── constants/
│   └── answerOptions.ts
├── hooks/
│   └── useSession.ts
├── pages/
│   ├── HomePage.tsx
│   ├── SessionQuestionsPage.tsx
│   ├── SessionResultPage.tsx
│   └── NotFoundPage.tsx
├── App.tsx
├── main.tsx
└── styles.css
```

### 2.5 模块依赖规则

- 组件层不直接发请求，数据统一由 hooks 提供；业务组件保持“展示 + 事件上报”。
- 页面层负责路由参数、页面级状态机与错误兜底。
- 所有接口出入参类型集中在 `api/types.ts`，页面不复制散落类型。
- Mock 与真实接口实现同一套接口签名，通过运行环境切换，页面代码无感知。
- 工具层不得依赖 React 组件与页面。

## 三、技术选型与实现建议

| 决策点 | 建议 | 为什么这么做 |
| --- | --- | --- |
| 语言与框架 | React + TypeScript + Vite（沿用现状） | 已搭好且类型检查利于契约驱动开发 |
| UI 组件库 | Ant Design v6 + @ant-design/icons | 表单、反馈、抽屉、加载态现成，符合中后台工具定位 |
| 中文本地化 | ConfigProvider 配 zhCN | 题目、按钮、日期/文案保持一致，避免组件自带英文残留 |
| 路由 | react-router-dom，BrowserRouter + 懒加载 | 页面少但需要 URL 承载 sessionId，支持刷新恢复 |
| 状态管理 | 不引入全局 Store；服务端状态用 hooks，页面瞬时态用本地 state | 服务端是权威，避免“本地副本与服务端不一致”的双写问题 |
| 请求层 | 轻量 fetch 封装，不引 axios | 项目接口少，只需统一 Cookie、CSRF、错误结构与超时 |
| 轮询 | 自研 useSessionPolling（2 秒间隔） | 契约固定 2 秒轮询；自研可控清理与终态停止 |
| 图渲染 | 按 level 分层的自研轻量布局，不引 D3/图库 | 最多 20 个节点，保证可读可点即可，控制体积与复杂度 |
| 反馈体系 | antd Spin/Skeleton/Alert/Result 组合页面级状态 | 生成是异步长流程，用户必须始终知道“进行到哪一步” |
| 代码质量 | 现有 ESLint + React Hooks 规则 + typecheck | 轮询、依赖数组、StrictMode 重复执行最容易出 bug |
| 版本管理 | 锁定依赖版本（当前 package.json 为 latest） | npm ci 虽可用，但 latest 会让团队后续安装漂移 |

### 3.1 技术理由补充

**为什么不上全局状态库？**

本项目需要共享的数据本质是“服务端会变的数据”：会话状态、答案、结果。这些数据反复轮询或通过 mutation 更新，本地再维护一份副本只会增加不一致风险。页面真正需要的瞬时状态（当前题号、侧栏打开哪个节点、是否提交中）用组件 state 或轻量 context 就足够。若后续出现跨页面共享的复杂本地状态（如全局草稿），再评估 Zustand，而不是首版就引入。

**为什么结果恢复要重新调 complete？**

契约没有提供“查询结果”的 GET 接口，结果由 complete 接口幂等返回。刷新结果页时不能只依赖内存，必须在会话为 COMPLETED 时再次调用 complete 恢复 nodes/edges。接口本身可重复调用、无答案变化时返回相同内容，不会重新触发模型或搜索。

**为什么用简单 level 布局而不是图算法库？**

后端已保证返回的 nodes 带 level、edges 只连接可见节点，并完成拓扑分层。前端不需要计算层级，只需要：按 level 分组、组内横向排布、用 edges 画连线、处理并行分支。首版用 CSS flex/grid 与简单连线即可；引入重图库对 20 节点场景是过度设计。

**为什么首页要懒加载其余页面？**

路由级懒加载让首页独立成最小的首屏包。结果页图表与题库相关的组件不会拖慢用户输入目标的速度，代价只是一次异步 chunk 加载。

### 3.2 依赖与主题

已安装并在当前前端使用：

```text
antd 6.6.x
@ant-design/icons 6.x
react-router-dom 7.x
```

- Ant Design 目前只承载 `ConfigProvider`、`Spin` 与 `Drawer`；页面视觉主要来自 [styles.css](../src/styles.css)，避免组件默认样式与品牌规范冲突。
- 主题主色统一为 `#5b61f6`，由 [main.tsx](../src/main.tsx) 和 `styles.css` 的 `:root` 同时维护。
- 视觉 token、组件状态、响应式与文案规则以 [UI_DESIGN.md](UI_DESIGN.md) 为准。
- `package.json` 仍有部分依赖标记为 `latest`，后续应锁定版本并保留 lockfile，保证团队构建可复现。

### 3.3 当前实现状态

已落地：

- 路由懒加载与 `sessionId` 放 URL 的刷新恢复方式。
- 首页、生成等待视图、逐题自评、右侧状态轨、结果路径图与资料侧栏。
- 本地 Mock 状态机：生成三阶段、答案保存/修改、`complete` 幂等恢复、资料四种状态。
- Mock 会话的 `localStorage` 持久化，刷新后按会话 ID 恢复。
- `Vite /api` 代理与本地开发、构建、类型检查、lint 命令。
- 真实 HTTP 请求层：`api/config.ts` 解析 `VITE_DATA_MODE`，`api/http.ts` 统一 fetch、Cookie、错误映射，`api/validators.ts` 做响应运行时校验，`api/real/sessions.ts` 实现六个业务接口，`api/sessions.ts` 按模式转发。
- 认证与 CSRF：`api/auth.ts` 通过 `auth/me` 建立会话并缓存 token，写请求带 `X-CSRF-Token`，`CSRF_INVALID` 刷新 token 但不自动重放。
- 全部答完后的复核修改、零题目完成、按 `edges` 绘制的 SVG 依赖连线与文字依赖列表、资料侧栏四种业务状态与可空字段。
- 2000ms 轮询、请求不重叠、终态停止、401/403/404 停止重试。

尚未落地：

- 登录 / OAuth：后端 `auth/zhihu/login` 与回调未实现，前端没有登录入口，真实身份仍依赖后端 `local-test`。
- 请求超时与 AbortController；当前只用 `cancelled` 标志忽略响应，不中断请求。
- 网络错误与 5xx 的有限退避（约定 2/4/8 秒），以及 429 `Retry-After` 读取。
- 服务端 `answeredCount` / `totalQuestions` 校准答题进度；当前用本地数组自行计数。
- `warnings` 的页面展示入口；字段已解析但未渲染。
- `resourceStatus` 为 `PENDING` 时的独立文案；当前会落入 READY 分支。
- 单元测试与端到端测试。
- Vercel 的 SPA fallback 配置与生产环境变量。
- 依赖版本锁定；`package.json` 多项仍为 `latest`。

## 四、状态流转说明

### 4.1 会话状态机（后端语义）

```text
GENERATING_GRAPH → SEARCHING_RESOURCES → GENERATING_QUESTIONS → READY → COMPLETED
        │                    │                      │
        └────────────────────┴──────────────────────┘
                             ↓
                          FAILED
```

前端视图映射：

| 会话状态 | 用户看到什么 | 前端动作 |
| --- | --- | --- |
| GENERATING_GRAPH | 生成前置知识中 | 等待视图，轮询 |
| SEARCHING_RESOURCES | 正在整理学习资料 | 等待视图 + 搜索进度 |
| GENERATING_QUESTIONS | 正在生成问卷 | 等待视图，轮询 |
| READY | 问卷 | 停止轮询，加载题目 |
| COMPLETED | 结果路径 | 停止轮询，幂等恢复结果 |
| FAILED | 失败提示与重试 | 停止轮询，展示 error.message |

关键语义：

- 轮询响应即使 `status = FAILED` 也是 HTTP 200，前端必须检查 status 而非只看 HTTP 状态码。
- `progress` 只在 SEARCHING_RESOURCES 阶段有意义，节点未生成时 `totalNodes = 0`，不能渲染成“0%”。
- 生成阶段不可恢复错误进入 FAILED；服务重启后未完成任务标记失败，前端引导重新创建。
- COMPLETED 后修改任一答案，会话回到 READY 并清除完成时间，前端必须清理旧结果并引导重新完成答卷。

### 4.2 前端页面级状态

每个页面的视图状态建议建模为：

```text
HomePage:      idle → submitting → success / error
QuestionsPage: loading → waiting(generating) | quiz(ready)
               quiz: loadingQuestion → answering → submittingAnswer → allAnswered → submittingComplete
ResultPage:    restoringResult → loaded / empty(全部掌握) / error
ResourcesSidebar: closed | loading | ready | empty | failed | notApplicable
```

统一规则：

- 路由级进入先校验会话状态（loading 态），避免直接渲染错误内容。
- 写操作（提交答案、完成答卷）进行中禁用对应按钮，防止重复提交。
- 会话进入终态（READY/COMPLETED/FAILED）后立刻停表，而不是继续空轮询。

### 4.3 关键场景状态流转

**创建任务**

1. 用户输入目标（trim 后校验 1～100 字）。
2. 点击“开始寻路”，按钮禁用，POST 创建。
3. 成功（202）后带 sessionId 跳转问答页，进入等待视图并开始轮询。
4. 400/429/401 按错误码提示；失败保留输入，允许重试。

**生成等待**

1. 进入 `/sessions/:id/questions` 后 GET 会话。
2. status 为 GENERATING_* 时继续轮询并展示阶段文案与进度。
3. 到达 READY 后停轮询，GET 题目并进入问卷。
4. 到达 FAILED 后停轮询，展示可读错误与“重新寻路”。

**逐题作答**

1. 题目按 sort_order 排列，答案含已保存的 answer，用于刷新恢复。
2. 用户选择答案，PUT 保存；成功后用响应中的 answeredCount 更新侧栏。
3. VERY_FAMILIAR / BASICALLY_KNOW 显示为已掌握；HEARD_OF / DONT_KNOW 显示为待补齐。
4. 支持返回上一题；修改后以服务端返回为准刷新侧栏。
5. 全部答完后出现“查看结果”，点击 POST complete。

**查看结果**

1. complete 返回 COMPLETED、missingCount、nodes、edges。
2. 前端跳转结果页并渲染；资料侧栏在点击节点后按需加载。
3. 全部前置已掌握时 missingCount = 0，只展示目标节点与开始学习提示。

**刷新恢复**

1. 从 URL 取 sessionId，GET 会话。
2. READY → 停留在问卷并加载已保存答案；COMPLETED → 跳结果页并幂等恢复结果；FAILED → 失败页；生成中 → 等待视图。

**修改答案（结果页返回改判断）**

1. 从结果页点“修改基础判断”，回到问卷页（此时会话仍 COMPLETED，可 GET questions）。
2. 修改任一题 PUT 后，服务端把会话置回 READY、清空完成时间。
3. 前端必须清除本地结果缓存并回到未完成问卷视图。
4. 用户重新提交 complete 后得到新结果。旧结果不能在界面上继续展示，避免“一半新答案、一半旧结果”。

**失败与重试**

- 创建失败：按 400/401/429 提示；保留输入。
- 生成失败（FAILED）：展示 error.message，提供“重新寻路”创建新任务。
- 单节点搜索失败：只进 warnings，不影响整卷；前端可在结果/资料处低调提示部分资料不可用。

### 4.4 数据对象状态

节点掌握状态：

| 状态 | 含义 | 前端展示 |
| --- | --- | --- |
| UNKNOWN | 未评估（目标节点） | 不参与缺口统计 |
| MASTERED | 已掌握 | 隐藏，不展示 |
| TO_LEARN | 待补齐 | 结果页展示并允许点资料 |

资源状态：

| 状态 | 含义 | 前端展示 |
| --- | --- | --- |
| READY | 有资料 | 展示资源列表 |
| EMPTY | 无合适资料 | 明确提示暂无资料 |
| FAILED | 搜索失败 | 提示搜索失败，不编造内容 |
| NOT_APPLICABLE | 目标节点不适用 | 展示目标说明而非资料列表 |

## 五、接口依赖与数据流

### 5.1 接口总表

| 方法 | 路径 | 谁调用 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/learning-sessions` | 首页 | 创建任务，202 返回 sessionId |
| GET | `/api/v1/learning-sessions/{id}` | 所有页初始化/轮询 | 查询状态与进度 |
| GET | `/api/v1/learning-sessions/{id}/questions` | 问答页 | READY/COMPLETED 可取题与已保存答案 |
| PUT | `/api/v1/learning-sessions/{id}/answers/{questionId}` | 问答页 | 保存或修改答案 |
| POST | `/api/v1/learning-sessions/{id}/complete` | 问答页提交、结果页恢复 | 幂等；完成或恢复结果 |
| GET | `/api/v1/learning-sessions/{id}/nodes/{nodeId}/resources` | 结果页侧栏 | 按节点取资料，可见节点可查 |

### 5.2 页面数据流

首页：

- 初始化无请求，纯静态 + 输入状态。
- 提交时 POST 创建，成功后跳转。
- 401 走登录提示；429 读 Retry-After。

问答页：

- 初始化 GET 会话，按状态决定等待还是答题。
- READY 时 GET questions，按 `sortOrder` 展示；answer 字段用于恢复。
- 每次答题 PUT，成功后局部刷新侧栏与进度；不做乐观乱序更新。
- 全部答完后 POST complete，成功后跳结果页。

结果页：

- 初始化 GET 会话做状态门禁。
- COMPLETED 时调用 POST complete 幂等恢复 nodes/edges（无独立 GET 结果接口）。
- 点击可见节点后 GET resources，成功按 nodeId 缓存；同一会话内重复点击不重复请求。
- 节点为 NOT_APPLICABLE（目标）时直接展示说明，不请求资料或做请求降级提示。

资料侧栏：

- 展示节点 name、description/reason、资源列表。
- voteCount 为 null 时展示“未知”，不得显示 0。
- 点击原文新标签页打开，链接加 `rel="noopener noreferrer"`，保留知乎 URL 的 UTM 参数。

### 5.3 加载、错误与空态约定

| 场景 | 展示 |
| --- | --- |
| 页面/数据加载 | Spin 或 Skeleton |
| 会话生成中 | Spin + 阶段文案 + 可选搜索进度 |
| 问卷加载失败 | 可重试的 Alert，不丢已答题目 |
| 提交答案失败 | 恢复可操作状态并提示，避免重复提交 |
| 会话不存在/无权访问（404） | 统一 NotFound/无权页，引导回首页 |
| 未登录（401） | 提示登录（首版登录 UI 是否上线待确认） |
| 限流（429） | “操作太频繁，请稍后再试”，遵循 Retry-After |
| 结果恢复失败 | 重试按钮，保留 sessionId |
| 资料为空/失败 | 对应 EMPTY/FAILED 文案，不允许伪造 |
| 图数据异常 | 兜底为可读的层级文字列表并提示异常，不白屏 |

统一业务错误结构：

```json
{ "error": { "code": "ANSWERS_INCOMPLETE", "message": "还有题目未作答，请完成后再查看结果。" } }
```

请求层统一把响应归一为“成功数据 或 { code, message }”，页面只消费业务码，不散落处理 HTTP 细节。

### 5.4 TypeScript 契约建议

与 [API_CONTRACT.md](../../docs/API_CONTRACT.md) 对应的集中类型（`src/api/types.ts`）：

```ts
export type SessionStatus =
  | 'GENERATING_GRAPH'
  | 'SEARCHING_RESOURCES'
  | 'GENERATING_QUESTIONS'
  | 'READY'
  | 'COMPLETED'
  | 'FAILED'

export type AnswerValue =
  | 'VERY_FAMILIAR'
  | 'BASICALLY_KNOW'
  | 'HEARD_OF'
  | 'DONT_KNOW'

export type MasteryStatus = 'UNKNOWN' | 'MASTERED' | 'TO_LEARN'

export type ResourceStatus =
  | 'PENDING'
  | 'READY'
  | 'EMPTY'
  | 'FAILED'
  | 'NOT_APPLICABLE'

export interface ApiErrorBody {
  error: { code: string; message: string }
}

export interface QuestionOption {
  value: AnswerValue
  label: string
}

export interface Question {
  questionId: string
  nodeId: string
  nodeName: string
  questionText: string
  hint: string | null
  options: QuestionOption[]
  answer: AnswerValue | null
}

export interface SessionDetail {
  sessionId: string
  target: string
  status: SessionStatus
  progress: { processedNodes: number; totalNodes: number }
  warnings: Array<{ nodeId: string; code: string; message: string }>
  error: { code: string; message: string } | null
}

export interface AnswerSaveResult {
  questionId: string
  masteryStatus: MasteryStatus
  answeredCount: number
  totalQuestions: number
}

export interface KnowledgeNode {
  id: string
  name: string
  isTarget: boolean
  level: number
}

export interface GraphEdge {
  from: string
  to: string
}

export interface CompletionResult {
  sessionId: string
  status: 'COMPLETED'
  target: string
  missingCount: number
  nodes: KnowledgeNode[]
  edges: GraphEdge[]
}

export interface LearningResource {
  id: string
  title: string
  url: string
  summary: string | null
  authorName: string | null
  voteCount: number | null
}

export interface NodeResources {
  nodeId: string
  nodeName: string
  reason: string
  resourceStatus: ResourceStatus
  resources: LearningResource[]
}
```

### 5.5 Mock 与联调策略

六个核心业务接口后端已实现，前端当前仍使用本地 Mock 跑通闭环。现状与后续约定：

- `api/sessions.ts` 定义了页面统一的接口签名，当前实现直接调用 `api/mock/store.ts`。
- 接入真实后端时，应保留同一套签名，在 `sessions.ts` 内部按 `VITE_DATA_MODE=mock|api` 转发到 Mock 或真实 fetch 实现，页面与组件无需改动。
- Mock 已覆盖：创建 202、`GENERATING_*` 三阶段推进、`READY`、答题与修改答案、`complete` 后回退 `READY`、资料 `EMPTY` / `FAILED` / `NOT_APPLICABLE`。
- Mock 会话使用 `localStorage` 持久化，刷新可恢复；真实后端应改为按会话 ID 请求服务端，而不是依赖浏览器本地存储。
- 后端 `local-test` profile 的两个上游测试接口仍可用于单独验证模型与知乎展示，但不能替代 `/api/v1` 业务联调。

## 六、风险点与待确认项

### 6.1 主要风险

| 编号 | 风险 | 影响 | 应对 |
| --- | --- | --- | --- |
| R1 | 六个核心业务接口未实现 | 前端无真实数据可联调 | 契约类型先行 + Mock；接口就绪后逐个替换 |
| R2 | Cookie/CSRF/CORS 跨域方案未定 | 登录态与写接口联调受阻 | 本地统一走 Vite 代理；尽早确认生产域名、SameSite、CSRF 获取方式 |
| R3 | complete 充当结果查询接口 | 刷新/回退后结果丢失或展示旧数据 | 结果页幂等恢复；修改答案后清缓存并重新 complete |
| R4 | 修改答案触发 COMPLETED → READY | 用户看到新旧混合结果 | 前后端统一状态机；旧结果页失效并引导重交 |
| R5 | 知乎/模型上游不稳定或限流 | 生成失败、资料缺失、429 | 展示阶段化错误与 warnings；不做假资料；支持重试创建 |
| R6 | 图数据异常（坏边、缺节点、畸形布局） | 白屏或误导性路径 | 渲染前校验；兜底为文字列表并提示异常 |
| R7 | 结果图被误画成单链 | 丢失并行分支语义 | 按 level + edges 布局，不用 level 差推断边 |
| R8 | 会话归属与权限语义不直观 | 误把“不是我的”当成系统故障 | 404 统一处理成“不存在或无权”，给返回首页出口 |
| R9 | 后续页面未遵守 UI 基线 | 页面视觉逐步漂移 | 以 [UI_DESIGN.md](UI_DESIGN.md) 与 `.impeccable.md` 作为 PR 自检项 |
| R10 | package.json 部分依赖为 latest | 依赖漂移、构建不可复现 | 锁定版本并保留 lockfile |
| R11 | 缺少自动化测试 | 状态机与剪枝逻辑回归风险高 | 为 Mock store、轮询 Hook、答题与 complete 补充单测，再补一条 E2E 主链路 |
| R12 | Mock 资料被误认为真实内容 | 对外传播不可信数据 | Mock 统一展示“演示数据”标识，接入真实接口后移除 |

### 6.2 待确认项

- 首版是否要求用户先登录：API 全量带 401，但登录页/OAuth 流程是否在本期实现需要产品与后端确认。
- CSRF Token 的获取与失效机制：后端已通过 `GET /api/v1/auth/me` 返回 `csrfToken`，前端仍需实现内存缓存、写请求携带和 403 后刷新令牌的处理。
- 生产环境前端访问后端的地址与环境变量名（建议 `VITE_API_BASE_URL`），以及 Vercel 与后端的 CORS/Cookie 策略。
- 热门知识快捷入口的清单是前端写死还是由后端/配置下发。
- 问卷“全部答完”后是自动提交 complete，还是用户点击“查看结果”后再提交（建议后者，避免误触）。
- 移动端适配边界：最小支持宽度、是否做 Drawer 全屏化。
- 结果页路径图的可视化上限：20 节点时是否可接受简单连线，是否需要横屏/缩放。
- 目标输入模糊的判定标准（后端 400 与产品提示的边界）。
- 结果页跨层边布局已改为按节点实测位置绘制 SVG 贝塞尔连线，此项已确定，不再作为待决问题。
- 测试范围：是否引入 Vitest / React Testing Library，以及 E2E 由谁维护。

## 七、当前遗漏与后续优化

从“能演示”到“能上线”之间，还缺以下工作，建议按优先级推进：

`api/sessions.ts` 双模式入口、CSRF 接入、复核修改、零题目、真实 edges 连线与资料四态已完成，不再列入下方清单。详细阶段状态见 [前端接口对接 TODO](FRONTEND_API_TODO.md)。

### P0 联调前必须补齐

- 补齐 `backend/secrets.properties` 的模型与检索凭证；缺失时任务稳定失败为 `GRAPH_GENERATION_FAILED`，真实链路无法走到结果页。
- 请求层补超时与 AbortController；当前只用 `cancelled` 标志忽略响应，实际请求不中断，切换 sessionId 时旧请求仍在飞。
- 网络错误与可重试 5xx 改为 2/4/8 秒有限退避加手动重试出口；当前是固定 2000ms 无上限重试。
- 401 补明确引导（未登录或 `local-test` 未启用），当前只展示后端原始 message。
- 配置生产后端地址环境变量与 Vercel SPA fallback，否则刷新子路由会 404。

### P1 影响质量与回归

- 答题进度改用 `saveAnswer` 返回的 `answeredCount` / `totalQuestions` 校准，替换当前的本地数组计数。
- 补 `warnings` 展示入口，在等待页或结果页给一处“部分资料暂不可用”的非阻断提示。
- 处理 `resourceStatus: PENDING`；当前会落入 READY 分支，渲染成“有 reason、零资料”的正常态。
- 读取 429 的 `Retry-After` 响应头，而不是只展示错误文案。
- `ResourcesDrawer` 把 409 `SESSION_NOT_COMPLETED` 与 404 从通用“资料加载失败”中分流。
- 为轮询 Hook、答题状态恢复、`complete` 回退 `READY` 与响应校验器补单元测试；再补一条完整 E2E：首页输入 → 等待生成 → 逐题自评 → 查看结果 → 打开资料侧栏 → 返回改答案。
- 把轮询间隔、退避阶梯等常量抽离为配置，便于测试和联调。

### P2 体验与工程化优化

- 资料侧栏增加按 `sessionId + nodeId` 的缓存层，并在改答案、退出登录、切换用户时失效；当前靠 `key={node.id}` 每次重新请求。
- 统一抽取错误码映射、空值格式化到 `utils`，避免在页面里重复判断。
- 锁定依赖版本，清理 `package.json` 中的 `latest`。
- 评估是否需要为资料侧栏、当前题号增加可测试的轻量 context，而不是过早引入全局 Store。

## 附录 A：工程与协作规范

### 本地命令

```powershell
cd frontend
npm ci
npm run dev
```

提交前检查：

```powershell
npm run lint
npm run typecheck
npm run build
```

后端健康检查：`GET http://localhost:8080/actuator/health`。本地开发建议在 [vite.config.ts](../vite.config.ts) 配置 `/api` 代理到 `http://localhost:8080`，保持同源 Cookie。

### 协作流程摘要

- 在自己 Fork 的 `main` 开发，PR 合入团队主仓库 `main`；提交信息格式 `类型: English description/中文说明`。
- PR 正文按 [CONTRIBUTING.md](../../CONTRIBUTING.md) 模板填写八个章节，使用简体中文与真实换行。
- 接口字段变化同步更新 [API_CONTRACT.md](../../docs/API_CONTRACT.md) 与本文件“TypeScript 契约”部分；页面与交互变化同步更新本文件。
- 页面改动附截图或演示。

### 部署

- Vercel Root Directory 为 `frontend`，构建命令为现有 `npm run build`。
- BrowserRouter 需要在 Vercel 配置 SPA fallback（rewrites），否则刷新子路径会 404。
- 生产后端地址通过环境变量注入，且需与 CORS/Cookie/SameSite 方案一起确认。

## 附录 B：常见坑清单

1. 把 ID 当数字或排序依据；契约规定 ID 为字符串。
2. 只判断 HTTP 状态码，忽略 200 响应里的 `status = FAILED`。
3. 轮询定时器未清理，StrictMode 下重复请求或组件卸载后 setState。
4. 修改答案后不清理本地结果，展示新旧混合内容。
5. 前端自行推导掌握状态，而不是以服务端返回为准。
6. 把结果图当单链渲染，忽略并行分支与跨层边。
7. 把 voteCount 为 null 显示成 0，或给失败节点伪造资料。
8. 直连后端不带 Cookie 凭证，或忽略 `auth/me` 下发的 CSRF Token。
9. 结果只存内存，刷新后无法恢复。
10. 每个页面复制类型与错误处理，而不是集中在 api/types 与请求层。

## 文档同步规则

本文档是 PRD 转化后的前端技术方案，也是前端团队的日常开发依据。需求、接口或架构变化时，至少更新本文件对应的章节；接口字段变化必须以 [API_CONTRACT.md](../../docs/API_CONTRACT.md) 为准，视觉与交互变化则同步 [UI_DESIGN.md](UI_DESIGN.md)，避免三份文档不一致。
