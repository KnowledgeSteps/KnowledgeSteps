# 前端实现说明

更新日期：2026-09-12。本文描述当前代码；待验收事项见 [接口待办](FRONTEND_API_TODO.md)，产品范围见 [项目说明](../../docs/PROJECT.md)，视觉规范见 [UI_DESIGN.md](UI_DESIGN.md)。

## 技术与运行

React、TypeScript、Vite、React Router、Ant Design 和 Ant Design Icons。英文与数字使用 Chillax，中文使用思源黑体，主题统一来自 `src/design/theme.ts`。

```powershell
cd frontend
npm ci
npm run dev
```

开发服务器将 `/api` 代理到 `http://localhost:8080`，生产构建不包含该代理。启动后端及认证配置见 [README](../../README.md) 和 [部署说明](../../docs/DEPLOYMENT.md)。

| 配置 | 当前行为 |
| --- | --- |
| `VITE_DATA_MODE=api` | 使用真实业务 API；失败不回退 Mock |
| `VITE_DATA_MODE=mock` | 本地模拟学习数据，仍需要真实后端认证 |
| 未指定数据模式 | 开发默认 mock，生产默认 api |
| `VITE_API_BASE_URL` | 可配置 API 地址前缀，默认空字符串、使用同源路径 |

`dev`、`build` 前自动准备 Chillax 字体，首次需要访问官方 CDN。依赖安装使用已提交的 lockfile 和 `npm ci`；package.json 部分版本范围仍为 latest，更新依赖时应审查 lockfile。

## 页面与路由

| 路由 | 用途 |
| --- | --- |
| `/login` | 统一登录入口；管理员表单可用，知乎 OAuth 尚未接通 |
| `/` | 输入目标、创建寻路任务 |
| `/sessions/:sessionId/questions` | 生成等待、本地自评及提交 |
| `/sessions/:sessionId/result` | 搜索等待、完整图谱及资料抽屉 |

业务页面受认证保护。问卷和结果按 sessionId 重建页面状态，切换任务不保留旧问卷、结果或抽屉。首页创建任务和问卷提交都有离页响应保护。

## 数据流程

`GENERATING_GRAPH → GENERATING_QUESTIONS → READY → SEARCHING_RESOURCES → COMPLETED`；生成异常进入 `FAILED`。无待搜索节点时 complete 可直接返回 COMPLETED。

- `useSession` 按两秒间隔串行轮询生成或搜索状态；终态不继续正常轮询。401/403/404 停止错误重试，其余错误仍按两秒重试。
- 图谱等待是预估进度，未完成最高 95%；完成后 0.9 秒升至 100%，停留 0.25 秒结束等待。资料搜索使用后端节点计数。
- 零前置节点展示补充目标、检查输入后重试的提示；不能据此断言输入一定错误。它与全部选择“非常了解”不同。
- 模型超时、JSON 解析失败和结构校验失败由会话 error 区分；简约弹窗展示原因。

## 自评与提交

每个前置节点一道题，目标不出题。选项是非常了解、基本了解、听说过、不了解；选择仅修改当前页面状态，并前往尚未作答题目。目录按题目顺序排列，只显示名称、当前题高亮及已答勾选，不按掌握状态分组。

“清空所有选择”清除全部本地答案、重置题号及进度，不发送清空请求。刷新恢复服务端已保存答案，不恢复未提交草稿。

点击“查看结果”后，`submitAssessment` 逐题调用 PUT 保存全部答案，成功后调用 complete。提交锁阻止重复提交，期间禁用作答、清空和题目导航。失败保留本地答案；离页停止后续请求并忽略完成响应，但已成功保存的答案不会回滚。

桌面问卷工作区固定 900px 高，答题与完成状态保持左右等高；超出内容内部纵向滚动。右侧目录标题固定；760px 以下上下排列，答题区固定 900px、目录区固定 420px。目录条目按可用宽度换行，不产生横向滚动条；勾选特效使用独立装饰层覆盖在各题高亮框上方，并为扩散效果预留右侧空间。题目切换有短过渡，减少动态效果时关闭。

## 图谱与资料

- 完整保留节点和 edges，不剪枝、不跨接已掌握节点。缺口统计后三档自评，不含目标。
- `level` 是后端按最长依赖路径计算的逻辑层级。前端同层每行最多五个节点，第六个换行但不改变 level；横向滚动限定在图容器。
- `GraphNodeCard` 展示名称、描述、Ant Design 图标及实际资料数量；读取节点资料用于填充描述和数量，打开抽屉时另行读取。
- 节点持续显示，不执行从下向上的入场动画；卡片整体不倾斜，悬停不显示外框，保留键盘焦点。
- `routeEdges` 以实际卡片矩形计算避让路径，SVG 使用淡蓝色直角折线，无箭头、圆点和混色。保留文字依赖列表。
- 非常了解最多 0 条，基本了解 2 条，听说过 3 条，不了解 5 条；目标不搜索资料。按钮显示实际返回数量，详情状态区分空结果、搜索失败及不适用。
- 网络读取失败可重读；已经保存的搜索失败不支持重新搜索。`PENDING` 尚无独立抽屉分支，列入待办。

## 模块位置

| 位置 | 职责 |
| --- | --- |
| `src/api/config.ts`、`sessions.ts` | 数据模式、接口统一入口 |
| `src/api/http.ts`、`requestTimeout.ts` | Cookie、响应校验、错误、超时与取消 |
| `src/api/auth.ts`、`real/sessions.ts` | 登录态、CSRF、真实接口 |
| `src/api/mock/store.ts` | 按用户和任务隔离的本地模拟数据 |
| `src/hooks/useSession.ts`、`useGraphProgress.ts` | 轮询与预估进度 |
| `src/components/quiz` | 题目、目录、勾选动画、提交过程 |
| `src/components/result` | 图谱、节点资料及抽屉 |
| `src/design` | 主题、字体、背景与模块样式 |

## 检查与边界

```powershell
npm run lint
npm run typecheck
npm run test:regressions
npm run test:loading
npm run build
```

最近检查为 14 项回归测试、6 项加载测试及 lint/typecheck/build 通过。浏览器视觉、真实模型和资料服务联调需另外记录，不能用 Mock 或静态构建代替。完整接口字段以 [后端接口约定](../../docs/API_CONTRACT.md) 为准。

主页 Transformer 示例在加载遮罩结束后自动展开演示一遍，约 4 秒后恢复交互控制。悬停、键盘聚焦或点击固定可保持展开，Escape 可收起；结果图谱不受此动效影响。

问卷的“返回首页”与目标名称通过顶栏插槽显示，正文不再保留独立工具栏，卡片靠近顶栏。窄屏导航在顶栏内部换行，长目标名称省略显示并保留完整标题提示。

### 历史寻路

顶部头像左侧的“历史寻路”进入 `/history`。页面按新到旧列出当前用户记录，每页 20 条，显示总数量；每条记录使用独立寻路卡片，保留 Dev Pass，展示学习目标、状态、根节点描述与日期，不包含票根。点击带登录残影效果的“进入寻路”按钮可继续自评或打开结果；支持刷新和失败重试。

历史记录可通过红色删除按钮硬删除；确认弹窗提交后永久移除该寻路及相关图谱、问卷、答案和资料。删除过程禁用重复操作，失败可重试，成功刷新分页及总数。
