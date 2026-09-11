# 知阶视觉与交互规范

所有现有和新增页面遵循本规范。主题源码：[theme.ts](../src/design/theme.ts)，字体：[fonts.css](../src/design/fonts.css)，公共布局：[styles.css](../src/styles.css)。

## 色彩与字体

| 品牌色 | 值 | 用途 |
| --- | --- | --- |
| 浅蓝 | #AFD0FC | 选中背景、辅助标记 |
| 中蓝 | #629FFC | 悬停、连接线、强调边框 |
| 深蓝 | #2977F8 | 主要操作、选中状态、目标节点 |

页面与卡片使用白底，辅助区使用主题中的浅色背景。正文采用深色中性色，错误与警告使用主题的语义色；禁止渐变、紫色装饰和霓虹背景。颜色统一从主题取值，不在组件内硬编码。

英文和数字使用 **Chillax**，中文使用 **思源黑体 Source Han Sans SC**。Chillax 的 Latin unicode-range 与中文字体组合，字体采用 swap 加载；正文 14–16px，辅助文字不小于 12px。公共控件圆角 8px；卡片使用指定的 Uiverse 圆角叠层风格，沿用原组件的 50px 外圆角与 55px 内圆角。数字使用等宽数字特性，不替换字体。

Chillax 来自 [Fontshare](https://www.fontshare.com/fonts/chillax)，遵循 public/fonts/Chillax-LICENSE.txt。字体二进制不进入 Git；`npm run dev` 和 `npm run build` 会自动执行 fonts:prepare，从官方 CDN 下载并校验固定版本，已缓存时不重复联网。首次构建需要访问 CDN。思源黑体来自 [Adobe](https://github.com/adobe-fonts/source-han-sans)，随项目保留 SIL OFL 授权和简体中文可变字体。生产页面从本站加载字体。

## 组件与页面

使用 Ant Design 和 Ant Design Icons。ConfigProvider 与 CSS 变量共同来自 theme.ts；添加通用颜色必须先修改主题。按钮、输入框、提示、卡片、步骤、进度、Modal 和 Drawer 优先复用 Ant Design。依赖图的 SVG 连线属于业务可视化，不替代图标库。

- 登录入口：白底、大标题、三个产品能力说明；知乎登录按钮保留指定的 Uiverse 交互，管理员入口固定左下角。管理员弹窗同样白底蓝色，保留浮动标签与来源许可。
- 首页：目标输入与依赖示例并列，下方介绍三个步骤；移动端顺序排列。
- 生成页：步骤、当前状态与资料搜索进度；失败可清楚识别。
- 答卷页：题目、四级自评、进度和题目导航；保存期间禁止跳题。
- 结果页：保留层级、分叉和依赖，不强制单一路径。目标与待补齐节点通过边框、文字和图标共同区分。
- 资料侧栏：白底，标题、摘要、来源和操作依次排列；空结果、读取失败和搜索失败分别显示。

## 交互与验收

控件提供 hover、focus-visible、disabled、loading 和 error 状态。状态不能只依赖颜色；图标按钮必须有可访问名称。弹窗支持 Escape、焦点恢复与键盘操作。窄屏不出现页面横向滚动，依赖图重排后连线仍与节点相连。尊重 prefers-reduced-motion。

新增页面运行 `npm run lint`、`npm run typecheck`、`npm run build`，并检查桌面与 390px 窄屏。不要只修改设计文档而不更新主题和实现。

## 统一卡片（Smit-Prajapati 样式）

所有内容卡片使用蓝色底层、白色半透明内层、右上角五层圆环及卡片对应的 Ant Design 图标，沿用 Chillax 与思源黑体。不使用原组件的绿色、渐变、社交按钮或 View more。保留实际业务操作。

通用卡片复用 [KnowledgeCard](../src/components/ui/KnowledgeCard.tsx)（直接使用用户提供的 HTML 结构）。具有特定语义的 section、节点按钮通过 `uiverse-parent` / `uiverse-card` 和 [CardDecoration](../src/components/ui/CardDecoration.tsx) 使用相同视觉；样式集中在 [cards.css](../src/design/cards.css)，不要逐页复制。

展示卡片允许原组件 30° 透视倾斜和圆环悬浮；题目和知识节点的位置保持稳定，避免影响输入与依赖图连线。触屏禁用悬停倾斜，减少动态效果时关闭动画。卡片高度随内容增长，不采用原示例的固定 290×300 尺寸。

卡片必须以用户粘贴的 Smit-Prajapati 原始 CSS/HTML 为基础，保留 parent > card > logo、glass、content 的层级及五层圆环尺寸、位移和延迟；只替换品牌颜色、字体、图标、删除底部操作，并增加必要的内容自适应与可访问性适配。不要重新绘制近似款。

管理员登录弹窗不属于内容卡片：使用原有蓝白表单、浮动标签和 INITIATE_CONNECTION 按钮，不使用圆环、玻璃叠层或卡片透视结构。

## 首屏与登录 Loading

首次打开、刷新（含 React 脚本加载前）、登录状态确认、管理员登录提交到目标页面就绪之间，使用 andrew-manzyk 的九层 Loading 文字与扫描线组件。原组件的文字渐变仅用于动画内部明暗，作为特例保留，不用于页面背景。来源 CSS 集中在 src/design/loading.css，React 组件为 LoadingScreen，index.html 提供同结构的启动占位。

每次 Loading 至少完整播放一轮（2 秒），请求超过 2 秒时继续循环，完成后退出。最短时间只控制遮罩显示，不延迟实际请求；不同加载阶段共享同一轮计时，避免重复等待。登录失败恢复原表单和错误提示；登录状态变化时不销毁正在处理请求的表单组件。减少动态效果时显示静态文字。

Loading 完成且达到最短播放时间后，以 300ms 淡出再移除；淡出期间继续拦截背景操作。若出现新加载请求则取消淡出并恢复显示，减少动态效果时关闭渐隐动画。

全站背景统一使用用户提供的 romeo_3200 波纹组件，集中在 `frontend/src/design/patterns.css`；允许该文件使用 repeating-radial-gradient 特例，保留左侧中点圆心、2px 线宽和 30px 间距。颜色由 theme.ts 提供，背景层不拦截操作、不产生滚动条；新页面沿用全局背景，内容卡片与弹窗保持独立表面。

主页右侧 Transformer 示例卡片为用户指定的例外：使用 SteveBloX 玻璃卡片样式（17px 圆角、6px 背景模糊、阴影），不使用三色圆点或五层圆环；尺寸自适应，蓝白配色由 theme.ts 管理。内部节点树参考 Esca-Byte 的 SVG 曲线与延迟显示效果，从 Transformer 向上逐个展开六个前置节点；鼠标移入、键盘聚焦或触屏点击可展开，Escape 可收起。示例卡片保留 SteveBloX 悬停放大及按下缩小倾斜效果；减少动态效果时关闭变形并立即显示节点。
