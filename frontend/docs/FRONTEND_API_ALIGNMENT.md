# 前后端接口对齐说明

更新日期：2026-09-12。六个寻路接口、当前用户、退出及管理员登录已接入。本文记录前端调用时机与差异，不复制完整 JSON；字段和错误码以 [API_CONTRACT.md](../../docs/API_CONTRACT.md) 和 `src/api/types.ts` 为准。

## 认证与传输

- 真实请求携带 Cookie，写请求附带 `X-CSRF-Token`。收到 CSRF 错误可刷新认证信息，但不自动重放写请求。
- 401 会使当前登录态失效并进入登录流程；管理员账号仍受任务归属检查，不能读取其他用户任务。
- Mock 仅替换学习数据，认证仍走后端；API 模式失败不回退 Mock。
- HTTP 请求超时 15 秒，包含响应体读取，支持 AbortSignal 并清理计时器。页面离开主要通过忽略响应和停止后续请求保护，并非所有在途请求都会立即取消。
- `Retry-After` 已解析到 ApiError，页面尚未统一实现倒计时与退避。会话轮询对非 401/403/404 错误继续固定两秒重试。

## 调用时机

下表寻路路径前缀为 `/api/v1/learning-sessions`。

| 操作 | 方法与路径 | 调用时机 |
| --- | --- | --- |
| 创建任务 | POST `/` | 首页提交有效目标 |
| 读取会话 | GET `/{sessionId}` | 页面加载及生成、搜索期间轮询 |
| 读取问卷 | GET `/{sessionId}/questions` | READY 或 COMPLETED 后恢复服务端答案 |
| 保存答案 | PUT `/{sessionId}/answers/{questionId}` | 点击查看结果后逐题保存；不是点击选项时保存 |
| 完成与恢复结果 | POST `/{sessionId}/complete` | 全部答案保存成功后；结果页恢复已完成结果 |
| 读取资料 | GET `/{sessionId}/nodes/{nodeId}/resources` | 图谱卡片读取描述和数量，抽屉打开或读取重试 |

创建任务实际路径为 `/api/v1/learning-sessions`，不要求末尾斜杠。ID 全程使用字符串，路径参数编码。没有独立 GET result、清空答案或重新搜索接口。

## 状态与字段

- 主流程：GENERATING_GRAPH → GENERATING_QUESTIONS → READY → SEARCHING_RESOURCES → COMPLETED。生成失败返回会话 FAILED，而非必须依赖 HTTP 错误。
- complete 可以返回 SEARCHING_RESOURCES，前端进入等待并轮询；没有待搜索节点时直接完成。重复 complete 不重复派发搜索。
- 问卷 answer 可以为 null；提交前计数来自本地草稿，这是预期行为，不应拿服务端已保存计数覆盖未提交选择。
- CompletionResult 包含 sessionId、status、target、missingCount、nodes、edges；节点包含 id、name、isTarget、level、answer、resourceLimit。
- NodeResources 包含 nodeId、nodeName、reason、resourceStatus、resources；描述和实际资料数由该接口提供，不将 resourceLimit 当作实际数量。
- warnings 是带 nodeId、code、message 的对象数组；目前缺少统一汇总展示入口。
- summary、authorName、voteCount 可为 null，不以 0 或虚构内容补足未知字段。

## 自评、缓存与恢复

四档资料上限为 0/2/3/5，只有非常了解记 MASTERED，其余 TO_LEARN。保留完整图谱，目标不出题、不搜索资料。

清空只修改本地草稿；提交顺序为逐题 PUT 后 POST complete。任一保存失败不调用 complete，保留页面选择供重试。提交不是批量事务，已保存答案不回滚；刷新从服务端恢复。

搜索期间拒绝修改答案。已完成后保存不同答案清理对应节点缓存并恢复 READY，保存相同答案保留缓存。提交后按待处理节点重新搜索，不重建图谱。

## 错误与当前差异

| 情况 | 当前处理或后续工作 |
| --- | --- |
| MODEL_REQUEST_TIMEOUT | 显示模型请求超时原因 |
| MODEL_JSON_PARSE_ERROR | 显示无法解析或字段类型错误 |
| MODEL_INVALID_RESPONSE | 显示输出不完整或响应异常 |
| GRAPH_VALIDATION_FAILED / QUESTION_VALIDATION_FAILED | 显示业务结构校验失败 |
| 零前置节点 | 提示补充目标或重试，不直接展示成功路径 |
| 资料网络读取失败 | 可重新读取 |
| 资料搜索 FAILED | 明确本次搜索失败，不提供无效重新搜索 |
| 资料 PENDING | 抽屉缺少独立提示，需完善 |
| 资料接口 404 / 409 | 当前统一读取失败，需进一步分流 |
| 非终止性轮询错误 | 尚需有限退避和手动恢复策略 |

## 验收入口

[接口待办](FRONTEND_API_TODO.md) 跟踪实现缺口；[实施与验收计划](FRONTEND_PLAN.md) 给出场景矩阵；[部署说明](../../docs/DEPLOYMENT.md) 说明认证、代理与环境配置。真实密钥是否可用需在联调环境检查，不在文档记录凭据或把历史缺失结论当作当前事实。
