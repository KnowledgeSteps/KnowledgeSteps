# 自评与资料推荐规则

更新日期：2026-09-12。

## 用户可见行为

结果保留全部节点、原始连线和层级，已掌握节点也能点击查看说明。节点不重新生成，使用最初生成的图谱。

| 自评 | 内部掌握状态 | 推荐资料上限 |
| --- | --- | --- |
| 非常了解 `VERY_FAMILIAR` | `MASTERED` | 0 |
| 基本了解 `BASICALLY_KNOW` | `TO_LEARN` | 2 |
| 听说过 `HEARD_OF` | `TO_LEARN` | 3 |
| 不了解 `DONT_KNOW` | `TO_LEARN` | 5 |

目标节点不参与自评，也不搜索资料。目标与非常了解的节点返回 `NOT_APPLICABLE` 和空资料数组，可查看节点说明。资料数量是上限；搜索结果不足、去重或过滤后不足时展示实际数量，不补造文章。`missingCount` 统计后三档节点，不含目标。

## 流程与接口

`GENERATING_GRAPH → GENERATING_QUESTIONS → READY → SEARCHING_RESOURCES → COMPLETED`

生成图谱和题目时不调用资料搜索。全部答题后提交 `POST /api/v1/learning-sessions/{id}/complete`，返回 HTTP 200；需要搜索时响应 `status=SEARCHING_RESOURCES`，前端继续轮询会话，结束后读取结果。没有待搜索节点时直接完成。

结果节点新增 `answer` 和 `resourceLimit`。前端、真实 API 与 Mock 均使用四档规则。知乎搜索使用节点名称作为查询词，并将该档数量传入 `count`；不修改两次模型调用的职责。

搜索阶段禁止修改答案，返回 409；重复完成请求不会重复派发搜索。已完成后提交相同答案保留缓存；修改答案只清理对应节点缓存，将任务恢复为 READY，重新提交时只搜索待处理节点。改为非常了解立即清理其资料。

单节点搜索失败标记 FAILED，并保留警告，其余节点继续执行，最终仍可查看图谱。重复完成不会自动重试已标记 FAILED 的节点。搜索任务与模型生成共用单实例有界队列；队列满时完成接口可返回 429，用户可稍后重试。

## 数据兼容与恢复

新增 Flyway `V3__assessment_resource_policy.sql`，不修改旧迁移。启动新后端时自动应用：保留历史图谱和答案，将旧完成任务恢复为 READY，根据新答案规则标记资源状态。旧缓存行暂留，新搜索成功或失败时在事务内替换；非常了解节点不会对外返回旧资料。用户重新提交已有答案即可，不需要重新调用模型。

搜索中服务重启时，已完整作答的任务恢复 READY，保留答案和已处理资料，重新提交继续处理待搜索节点。未完成图谱或题目生成的中断任务仍按原规则标记失败。

## 主要实现

- `ResourcePolicy`：后端四档上限。
- `GenerationPipeline`、`LearningSessionService`：答题后异步搜索、重复请求保护。
- `JdbcSessionStore`：完整图谱、答案缓存失效与恢复。
- `ZhihuSearchClient`：请求数量与结果数量限制。
- 前端结果节点显示四档标签与推荐上限，非常了解仍可打开说明。

## 验证

后端集成测试覆盖四档数量、非常了解节点保留、重复提交、修改答案、搜索期间禁止修改、失败降级与中断恢复。前端运行 lint、typecheck、build 和回归测试。

浏览器连接工具当前返回 `nodeRepl.fetch request failed`，桌面和窄屏的实际浏览器视觉验收尚未完成。
