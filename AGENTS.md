# Codex 协作规则

## GitHub PR 审查语言

- 所有自动 PR 审查总结、行内评论和后续回复统一使用简体中文。
- 代码标识符、命令、文件路径、接口名称和无法准确翻译的技术术语可以保留英文，但必须用中文解释其含义和影响。
- 每条审查意见应说明问题出现的条件、可能造成的影响以及建议的修复方向，不能只给出笼统结论。
- 使用标准 Markdown 段落和列表，并使用真实换行。禁止在正文中用字面量 `\n` 代替换行。

## 审查重点

- 优先指出会影响正确性、数据隔离、安全性、并发行为、部署和用户体验的问题。
- 标明问题所在文件和代码位置，并给出可以执行的修改建议。
- 如果没有需要修改的问题，使用中文明确说明审查通过。

## 前端视觉规范（所有现有和新增页面）

- 使用 Ant Design 组件和 `@ant-design/icons` 图标；不要用 Emoji 代替界面图标。
- 白底蓝色，不使用渐变、紫色装饰、霓虹背景；卡片允许使用指定 Uiverse 组件的半透明蓝白叠层。
- 品牌色：浅蓝 `#AFD0FC`、中蓝 `#629FFC`、深蓝 `#2977F8`。错误与警告可使用主题中的语义色。
- 英文和数字使用 Chillax，中文使用思源黑体。字体定义在 `frontend/src/design/fonts.css`。
- `frontend/src/design/theme.ts` 是颜色、字体及公共组件主题的唯一来源；页面 CSS 使用其生成的变量，不新增硬编码颜色。
- 按钮、输入、进度、弹窗和侧栏复用 Ant Design；依赖图等业务布局可自定义。
- 新页面必须包含键盘焦点、加载、禁用、失败和移动端状态，并遵守 `frontend/docs/UI_DESIGN.md`。
- 完成前运行前端 lint、typecheck 和 build；视觉修改同时检查桌面和窄屏效果。

- 卡片统一复用 `KnowledgeCard`；有特殊语义的内容容器或节点按钮使用 `uiverse-parent` / `uiverse-card` 与 `CardDecoration`。右上角使用 Ant Design 图标，禁止恢复原组件社交按钮与 View more。答题区和依赖图卡片保持位置稳定，仅展示卡片可倾斜。

卡片必须以用户粘贴的 Smit-Prajapati 原始 CSS/HTML 为基础，保留 parent > card > logo、glass、content 的层级及五层圆环尺寸、位移和延迟；只替换品牌颜色、字体、图标、删除底部操作，并增加必要的内容自适应与可访问性适配。不要重新绘制近似款。

- 管理员登录是独立表单弹窗，不属于内容卡片。保持原蓝白浮动标签表单，禁止套用 `KnowledgeCard`、`CardDecoration` 或 `uiverse-*` 卡片结构。

- 首屏、刷新和登录等待复用 `LoadingScreen`；保留 andrew-manzyk 原组件的文字渐变动画，仅 `design/loading.css` 允许该渐变特例。每次 Loading 至少显示一轮（2 秒），请求未完成时继续循环；等待只控制遮罩，不延迟实际请求或吞掉登录失败提示。

全站背景统一使用用户提供的 romeo_3200 波纹组件，集中在 `frontend/src/design/patterns.css`；允许该文件使用 repeating-radial-gradient 特例，保留左侧中点圆心、2px 线宽和 30px 间距。颜色由 theme.ts 提供，背景层不拦截操作、不产生滚动条；新页面沿用全局背景，内容卡片与弹窗保持独立表面。

主页右侧 Transformer 示例卡片为用户指定的例外：使用 SteveBloX 玻璃卡片样式（17px 圆角、6px 背景模糊、阴影），不使用三色圆点或五层圆环；尺寸自适应，蓝白配色由 theme.ts 管理。内部节点树参考 Esca-Byte 的 SVG 曲线与延迟显示效果，从 Transformer 向上逐个展开六个前置节点；鼠标移入、键盘聚焦或触屏点击可展开，Escape 可收起。示例卡片保留 SteveBloX 悬停放大及按下缩小倾斜效果；减少动态效果时关闭变形并立即显示节点。

用户指定的渐变特例：登录页主标题第二行“帮你找到还缺的基础。”使用浅蓝 → 中蓝 → 深蓝文字渐变，由 theme.ts 的 login-title-gradient 管理，仅用于这行文字。

用户指定的等待页例外：WaitingView 使用 dylanharriscameron 的 card > bg + blob 动画容器，光斑改浅蓝并适配容器尺寸；不套用五层圆环。图谱等待使用 24 段方块进度条，下方数字标注预估，未完成最高 95%。步骤连接线与方块使用同一数值，不循环；后端完成后用 0.9 秒加速至 100%，停留 0.25 秒再结束等待展示，不延迟实际请求。样式集中 design/waiting.css，支持窄屏与减少动态效果。

用户指定的失败提示例外：SessionNotice 使用简约 Ant Design Modal，只保留标题、原因和操作按钮，不使用 KnowledgeCard、CardDecoration 或 uiverse 卡片装饰。

用户指定的答题页例外：SessionQuestionsPage 与 StatusRail 使用简约白底双栏页面，不使用 KnowledgeCard、CardDecoration 或 uiverse 装饰。桌面右侧高度由左侧内容决定，右侧列表内滚动、标题固定；窄屏上下排列并限制列表高度。样式集中 design/quiz.css。
