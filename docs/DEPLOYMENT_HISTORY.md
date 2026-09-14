# 历史部署记录

以下保留历次说明，包含当时的未发布状态；不能作为当前操作指南。当前指南见 [部署说明](DEPLOYMENT.md)。

# 部署说明

## 前端

前端部署到 Vercel，Vercel 项目的 Root Directory 设置为 `frontend`。

## 后端与 SQLite

后端部署在支持 Java 或 Docker、并提供持久化磁盘的服务上。设置 `SQLITE_JDBC_URL`，例如：

```text
jdbc:sqlite:/var/lib/zhihu-learning/hackathon.db
```

不要把 SQLite 文件放在临时目录、容器镜像或 Git 仓库。单实例运行；每次数据库结构变更前备份数据文件。

生产 HTTPS 部署设置 `SESSION_COOKIE_SECURE=true`，不要启用 local-test（它提供固定开发身份和上游测试接口）。会话默认空闲 30 分钟过期，Cookie 为 HttpOnly、SameSite=Lax。若前后端跨站部署，需要另行设计 CORS、SameSite 和 CSRF 配置，不能直接放开所有来源。

## 管理员登录演示站点

后端设置 `SPRING_PROFILES_ACTIVE=admin-login`，该配置强制 Secure Cookie；不要同时启用 `local-test` 或 `admin-local`。使用平台 Secret 注入 `AUTH_ADMIN_USERNAME` 和 `AUTH_ADMIN_PASSWORD_HASH`，密码哈希格式及生成方式见 API 约定。不要将本机 `admin-credentials.txt` 明文密码文件上传到服务器、镜像或前端。

前端构建时设置 `VITE_DATA_MODE=api`。推荐同源部署：将 `/api/*` 代理到后端，其他路径由前端承载；`/login`、`/sessions/*` 刷新时需要前端 SPA 回退。Vite 的开发代理不参与生产构建，当前仓库不会自动生成你实际域名的生产代理配置。域名和部署平台确定后，需要在平台配置 HTTPS、代理和 SPA 回退，再做实际浏览器验收。

登录路径为 `/login`，登录后使用服务器会话 Cookie，不向浏览器暴露密码哈希。管理员账号只读取自己的任务，多人共用账号会看到相同任务。退出后必须重新登录；重启后会话失效。修改密码哈希后重启后端，使配置生效并清除旧会话。

当前登录尝试按单实例全局限制为每分钟 10 次，团队成员共用额度；持续失败尝试也会占满窗口。此入口用于团队演示，面向更多用户开放时需要补充入口限流策略或接入正式用户登录。

本地 HTTP 调试使用 `admin-local`：首次在 backend 目录运行 `powershell -ExecutionPolicy Bypass -File scripts/setup-admin-login.ps1`，在本机 `admin-credentials.txt` 查看生成的账号和密码。配置文件 `admin-login.properties` 只保存用户名与哈希，和初始密码文件一起被 Git 忽略。脚本不会覆盖已有文件；需要重置时，先自行保管旧凭证并明确处理这两个本地文件，再运行生成脚本。

## GitHub Secrets 与 Variables

部署前，在仓库 Settings → Secrets and variables → Actions 中添加：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `DEPLOY_ENABLED` | 设置为 `true` 后启用 `main` 自动部署 |
| Secret | `VERCEL_TOKEN` | Vercel CLI 部署凭证 |
| Secret | `VERCEL_ORG_ID` | Vercel 组织 ID |
| Secret | `VERCEL_PROJECT_ID` | Vercel 前端项目 ID |
| Secret | `BACKEND_DEPLOY_WEBHOOK_URL` | 后端平台的部署触发地址 |
| Secret | `BACKEND_HEALTHCHECK_URL` | 后端的 HTTPS 健康检查地址，例如 `https://api.example.com/actuator/health` |

部署工作流仅在 `main` 的构建和测试通过后运行。未设置 `DEPLOY_ENABLED=true` 时，部署阶段会被跳过，但 CI 仍会正常运行。

## AI、资料搜索与迁移

后端模型配置为 `model.base-url`、`model.api-key`、`model.graph-model`、`model.question-model`。当前代码默认图谱模型为 `gemini-3-flash`，问卷模型为 `gemini-3.1-flash-lite`；默认名称不保证账户有调用权限。Gemini 图谱请求使用 `reasoning_effort=low`，问卷请求使用 `minimal`（需确认转发平台透传支持），两阶段均使用 JSON Object 输出、8192 token 上限、5 秒连接和 60 秒读取超时。密钥仅注入后端，参考 `backend/secrets.properties.example`，不要放入 VITE 环境变量。

知乎资料搜索在答案提交后执行；凭据与配置说明见 [API 约定](API_CONTRACT.md)。图谱及问卷提示词打包在后端 classpath，更新提示词需重新构建、部署并重启；旧任务不会自动重新生成。

当前数据库迁移到 V7。升级前备份，保留 Flyway 历史，不改旧迁移；V3 的旧任务恢复和资料策略见 [自评资料规则](ASSESSMENT_RESOURCES.md)。生成和资料搜索共享单实例有界队列，不支持把 SQLite 挂给多个后端实例并行运行。

## 发布验收

检查登录、CSRF、真实生成、自评提交、资料读取、越权拒绝及子路由刷新。CI、Mock 测试和健康接口不能替代浏览器验收；目前待验收清单见 [undo.md](../undo.md)。

### 寻路 ID 配置

`SESSION_ID_WORKER_ID` 为雪花算法节点号，默认 `0`，范围 `0–1023`。单实例保持默认即可；需要跨独立数据库保证 ID 唯一时，为各实例分配不同节点号。共享 SQLite 的原子持久化状态可协调同节点号分配。上线重启后端自动执行 V4；备份数据库时同时保留 session_snowflake_state，旧链接不变。


## 当前 Azure 部署（2026-09-13）

站点：https://ksteps.yinbo.online 。服务器为韩国 Azure Ubuntu 22.04，2 vCPU、1 GiB 内存，采用 Nginx + Java 21 + systemd + SQLite 单实例。当前沿用本地模型、知乎配置及管理员账号，数据库全新初始化，不包含本地历史记录。管理员初始凭据在本机被 Git 忽略的 `backend/admin-credentials.txt`，不要上传或提交该文件。

- 前端：`/var/www/knowledgesteps`；构建时 `VITE_DATA_MODE=api`、`VITE_API_BASE_URL` 为空，同域访问 API。
- 后端：`/opt/knowledgesteps/app.jar`；仅监听 `127.0.0.1:8080`。
- 配置：`/etc/knowledgesteps/application.properties`，仅 root 与服务账号可读。
- 数据库：`/var/lib/knowledgesteps/hackathon.db`，升级时保留整个目录。
- 服务：`knowledgesteps.service`，开机启动，异常退出自动重启；JVM 最大堆 320 MiB，此值不等于进程总内存。
- HTTPS：Let's Encrypt，`certbot.timer` 定期续期，部署钩子验证并重载 Nginx。80 端口保留证书验证，其余 HTTP 请求跳转 HTTPS。

配置模板位于 `deploy/`。`prepare-azure.sh` 仅用于首次引导，会安装 HTTP 引导配置；日常更新不要直接重跑此脚本。日常更新在本机构建并验证后上传 jar 和前端产物，替换对应文件并执行 `sudo systemctl restart knowledgesteps`，保留数据库及私密配置。

运行检查：`sudo systemctl status knowledgesteps`；日志：`sudo journalctl -u knowledgesteps -n 100 --no-pager`；本机健康检查：`curl http://127.0.0.1:8080/actuator/health`。备份使用 SQLite 在线备份命令，例如 `sudo sqlite3 /var/lib/knowledgesteps/hackathon.db ".backup /root/knowledgesteps-backup.db"`，不要在写入时只复制主数据库文件。

当前使用管理员共享账号，登录该账号的成员会看到同一份历史寻路；独立用户隔离需要启用正式用户登录。浏览器桌面与移动端交互仍需人工验收。


### 生成并发配置

`GENERATION_WORKERS` 默认 `4`，有效范围 `1–32`；固定等待队列为 `8`。图谱生成、问卷生成和答题后资料搜索共享此线程池。更改环境变量并重启后生效。默认值变更尚未部署到 Azure，当前线上仍使用原单线程版本。四线程的本地测试不能替代 1 GiB 服务器环境验证。


### Nginx IP 限流（配置已验证，尚未在线启用）

`deploy/ksteps-https.conf` 须从 Nginx `http` 上下文加载，包含 map 与共享限流区。HTTPS 下按直接连接客户端 IP 使用漏桶限速：普通 `/api/` 为 20 请求/秒，额外突发 40；创建寻路 POST 为 60 请求/分钟，额外突发 20；管理员登录 POST 为 5 请求/分钟，额外突发 5。创建和登录也同时受到普通 API 限制。静态页面、资源与证书验证不计入上述规则。

IP 限制保护入口；用户 10 次/滚动分钟与 20 条历史由后端执行。Nginx 被限流时返回 HTTP 429 和 JSON 错误 `IP_RATE_LIMITED`，建议 60 秒后重试。共享校园/公司公网 IP 的用户共用入口额度，因此阈值比单用户规则宽。当前 DNS-only 直连服务器，使用 `$binary_remote_addr`；未来开启 Cloudflare 代理前，必须配置只信任其官方代理地址范围的真实 IP 恢复，不能直接信任任意客户端 X-Forwarded-For。

本轮仅上传独立候选配置并执行 `nginx -t` 验证，未覆盖正在使用的配置、未 reload、未部署后端。发布时先备份 SQLite，部署 V6 后端及新 Nginx 配置，验证后重载。新的后端默认也包含四工作线程变更。


### 本地模型平台切换

本地 `backend/secrets.properties` 已设为 `model.base-url=https://api.openai-next.com/v1`，实际请求路径 `/v1/chat/completions`。图谱使用平台列表中的 `gemini-3-flash`，问卷使用 `gemini-3.1-flash-lite`。在该文件的 `model.api-key=` 后填写新平台 Key，重启本地后端生效。不会把旧平台 Key 发送到新域名；原配置暂存于被 Git 忽略的 `backend/target/model-config-before-openai-next.properties`，不要提交或分享。

目前仅验证请求格式和无凭证的模型列表接口返回 401。模型别名可用性、转发平台对 reasoning_effort / JSON 模式的支持及真实生成速度，需填写新 Key 后验证；线上仍使用旧平台，未部署切换。


### 在途限制、幂等及上游退避（本地待发布）

每用户 2 个在途任务，由单实例线程池提交和完成时计数，与历史删除独立。四线程仍为全站容量；同一管理员不能再同时提交四个独立任务，四线程压测应使用不同用户。没有增加每日预算限制。

创建请求使用 Idempotency-Key，V7 保存 24 小时幂等凭据；更新后端、前端时一起发布。Nginx 默认会向上游传递该请求头。模型 429 增加最多两次有随机延迟的重试，单次退避最多 30 秒，更长 Retry-After 直接报告繁忙。限流退避期间也占在途位置，避免请求积压无限增长。

本轮只进行本地代码和自动化验证，没有部署或重启线上服务。


## 最新线上发布：2026-09-13

前文标为“本地待发布”“尚未在线启用”的变更已在本次发布生效：四工作线程、每用户 2 个在途任务、滚动一分钟 10 次创建、20 条历史上限、24 小时幂等凭据、模型 429 有限退避，以及 Nginx IP 限流。数据库当前 V7；前端使用真实 API、同域代理。

模型已切换至 `https://api.openai-next.com/v1`：图谱 `gemini-3-flash`、问卷 `gemini-3.1-flash-lite`。模型 HTTP 请求带 KnowledgeSteps User-Agent。原线上管理员和知乎凭据保留，OAuth 功能没有随此发布接通。

发布前备份：`/var/backups/knowledgesteps/release-20260912T185821Z`。线上验证结果见 [防护策略](PROTECTION_STRATEGY.md) 最后一节。该备份只代表此次发布前快照，不是定时备份系统；线上有新增数据后回滚数据库前应先另做当前快照，不能直接用旧库覆盖最新记录。

## 知乎登录发布：2026-09-13 14:27（北京时间）

OAuth 链路已部署，App ID 459，回调为 `https://ksteps.yinbo.online/api/v1/auth/zhihu/callback`。前后端与 Nginx 同步更新，后端服务已重启，数据库结构仍为 V7且保留既有历史。新备份在 `/var/backups/knowledgesteps/oauth-20260913T062753Z`。

本次严格校验 OAuth state、轮换登录会话、按稳定知乎 uid 隔离账户，并使回调及限流日志不记录授权码。自动化测试与线上未授权路径验证已通过；14:28:58 已有真实授权成功，数据库确认独立知乎账户、昵称与 HTTPS 头像。参见 [知乎登录说明](ZHIHU_OAUTH.md)；不要因平台缺失 state 而关闭关联校验。

## 上游 main 更新：2026-09-13 14:35（北京时间）

本地先同步 fork 的 `origin/main`，再快进至主项目 `KnowledgeSteps/KnowledgeSteps` 的最新 main：`95fe239`（PR #22）。本次发布在该提交基础上保留尚未提交的本地 OAuth 实现，不能用纯远端构建替换，否则会移除已上线的知乎登录。

更新包括学习目标非字符串参数拒绝、统一 JSON 兜底错误，以及 Nginx 各 location 的安全响应头。合并 Nginx 时保留 OAuth 回调与限流路径的 `no-referrer`、日志抑制和原有请求限制。前端代码无上游变化，保留已通过验证且与服务器一致的 OAuth 前端产物。

合并后后端 185 项测试通过；线上验证健康检查 UP、未知接口 404 JSON、首页/静态资源/API/回调安全头、OAuth 授权跳转与非法回调拒绝。部署等待当时在途任务结束，14:35:58 重启后端；服务重启后用户需重新登录。

发布前备份：`/var/backups/knowledgesteps/main-95fe239-20260913T063556Z`。数据库仍为 V7，未覆盖数据库或私密配置，发布后确认 3 个知乎账户及其昵称头像仍存在。线上 jar 与本次构建 SHA-256 一致：`a811032de3f31b59708dbca5d0d3a7b5da176fab82b6b8f74c8358659a9adf8c`。

## 生成恢复与 JSON 纠错发布：2026-09-13 14:53（北京时间）

修复生成过程因一次状态读取失败显示“回首页”的问题。前端保留原任务状态，任务、问卷和结果读取遇到可恢复错误时最多自动重试 4 次；耗尽后可手动重读同一条寻路。真实生成失败、登录失效和无权访问分别处理，不把网络异常写成生成失败。

后端对外层响应、内容 JSON、字段和图谱/问卷关系统一校验，将安全的错误类别反馈给模型纠正，每阶段最多 3 次内容尝试。合法深图额外优化最多 1 次，失败保留原合法图谱；429 重试整个阶段共享 2 次预算。完整上限见 [防护策略](PROTECTION_STRATEGY.md#9-模型校验纠错与-429-退避)。

发布前通过后端 204 项测试、前端 27 项回归和 6 项加载控制测试，以及前端 lint、typecheck、build。测试覆盖临时读取失败后恢复、非法 JSON/字段/节点关系纠错、重试耗尽、真实 FAILED、旧身份迟到响应和完整生成流水线。当前浏览器连接工具不可用，未进行桌面及窄屏目测；不将自动化行为测试记作视觉验收。

发布前短暂暂停创建和完成提交，确认已有后台任务结束后，于 14:53:12 重启后端，再原子切换前端入口；保留旧版带哈希的静态资源供已打开页面读取，随后恢复正常入口配置。备份目录：`/var/backups/knowledgesteps/generation-recovery-20260913T065307Z`。数据库仍为 V7，私密配置与发布前逐字节一致，发布前后 7 个知乎账号及昵称头像均保留。

线上健康检查、OAuth 授权入口和非法回调拒绝、安全响应头、JSON 404 均通过。公网入口和问卷/结果/恢复逻辑对应 JS 与本地构建哈希一致；jar SHA-256 为 `9626c169f0b9e9c3edb64042b9f11f44a6cd5db02449b47e1484a23e4f66bb6d`。后端重启会使内存中的登录会话失效，用户需重新登录。

## 手机问卷与结果图谱发布：2026-09-13 15:34（北京时间）

用户审查本地版本后发布前端：手机问卷改为自然高度，保留底部单个目录入口，目录使用底部抽屉；结果树首次完整适配图谱视窗，支持双指缩放、单指拖动、缩放按钮与“显示全图”。节点说明异步增高时仍可完整适配，缩放连线保持贴合，手势结束不误开资料。桌面问卷双栏及结果图谱横向滚动保留。

本次仅发布 `frontend/dist`，没有替换后端 jar、重启服务、修改 Nginx 或私密配置，也没有迁移或覆盖数据库。后端 PID 与启动时间在发布前后相同，已有登录和在途任务继续运行。已打开页面刷新后加载新界面。

备份目录：`/var/backups/knowledgesteps/mobile-ui-20260913T073419Z`。校验完整生产清单后，仅上传 12 个变化文件；服务器 102 个产物全部匹配清单，旧版哈希资源保留以支持已打开页面。先发布依赖文件，再原子切换 `index.html`；入口 SHA-256 为 `e4bf3d51e055bf8e4fc9c4e5b00cd8660028a64b5d494226128bf9f2ff65b508`。

发布前通过前端 lint、typecheck、build、27 项回归及 5 项图谱几何测试；本地浏览器覆盖 320/390/440px、桌面、真实触摸事件模拟、深图与延迟描述、目录跳转和完成后复核。真实触摸事件验证使用浏览器设备模拟，不代表全部品牌真机验收。

公网校验：首页、登录、问卷与结果子路由均返回新入口，91 个 JS/CSS 等静态资源的内容哈希与本地产物一致；未登录 API 返回 401 JSON，知乎授权入口返回 303 并指向已配置的知乎授权地址。后端健康检查为 UP。

公网浏览器通过本机既有网络代理检查 390px 和 1440px 登录页，页面及知乎登录按钮正常，无资源加载失败或脚本异常；390px 首轮身份读取超时，单次重载后返回预期 401 且提示消失。仅检查未登录入口，没有进行真实授权或创建线上测试数据。

## 2026-09-13 17:10（北京时间）：审查修复及二次补修发布

用户授权部署本地累计修复。发布 review-second-fix-artifact，源提交 95fe2393d7872948dfbf4492e87752626ac1980e，包含未提交修改（dirty=true），不是纯远端提交构建；未创建提交或推送 Git。此次覆盖管理员登录来源隔离、任务取消和总时限、SQLite 写竞争、按需资料读取、脱敏诊断、字体分片、页面恢复、轮询取消、答题草稿，以及旧任务超时误伤后续阶段和残留 WAL 污染恢复的二次补修。

发布前 Java 21 Maven verify 共 233 项测试通过；前端 48 项测试及 lint/typecheck/build 通过；运维 7 项测试在本地及服务器 Python 3.10 均通过。服务器 169 个安装文件 SHA-256 与验证产物一致。

- 后端 SHA-256：`6440c1d14c5ad497cc9f8120327fef8a8a7b2aaa4ed27221bdec120ff7c91059`。
- 前端入口 SHA-256：`19b3ca32a225183bea1f60c5599d4b128865972e9ed72b85e0279baf5e3158f9`。
- 发布前备份：`/var/backups/knowledgesteps/review-fixes-20260913T091054Z`，包含 SQLite 在线快照、后端、前端及私密配置，仅 root 可读。
- 数据库快照 SHA-256：`d68095fbb3e803558594f98711752bda2400c147007d4c9f347f19e5d2cbafea`。

短暂暂停创建和提交入口，等待在途任务归零后切换；Nginx 配置与私密 application.properties 发布前后字节一致。服务在 09:10:59 UTC 启动，PID 24622，状态 active，健康检查 UP。只重启后端服务，未重启整台服务器；旧内存登录会话需重新登录。发布后保留 47 条寻路、16 个用户及全部关联业务表数量，quick_check 和 foreign_key_check 通过。

公网 HTTPS、首页/登录/历史/问卷/结果共 5 个前端路由入口哈希、未登录 API 401、知乎授权跳转、管理员登录及历史读取通过；没有发起新的模型生成请求，也未重复操作真人知乎授权。

已安装 database_backup.py 及 knowledgesteps-backup.service/timer，首次备份 Result=success、ExecMainStatus=0；每天 UTC 04:00 加最多 15 分钟随机延迟执行，保留最近 7 份，目录为 /var/lib/knowledgesteps-backups。下一次当时显示为 2026-09-14 04:02:48 UTC。这是同机备份，异机备份尚未配置。

公网浏览器验收：390px 手机视窗及 1440px 桌面登录页布局正常，无横向溢出或脚本异常；本次为浏览器模拟视窗，未做真实手机全流程验收。

恢复入口后再次只读检查，线上寻路数量由发布时的 47 条增至 49 条，用户仍为 16 个，节点/答案/资料数量也增加；因此发布时与持续服务后的表计数不再恒等。本次验证没有创建这些寻路。当前数据库完整性、外键、169 个产物哈希和私密配置复核仍通过。

## 2026-09-13 18:02（北京时间）：访问统计发布

线上缺少访问统计入口的原因是仍运行 17:10 的旧版，统计接口返回 404。本次按用户要求发布已在本地验证的前后端统计功能，服务于 10:02:01 UTC 重启，未重启服务器。

- 发布包源提交 a172d8de71940c9730c11e72899079cfc54f5954，含未提交修改（dirty=true）；180 个安装文件 SHA-256 核对通过。
- 发布前备份：`/var/backups/knowledgesteps/analytics-20260913T100156Z`，含数据库、旧版前后端、Nginx 和私密配置。
- 暂停创建与完成提交入口，等待在途任务归零后发布；Flyway 从 V7 升至 V9，业务表计数保留，数据库完整性和外键检查通过。
- 保留私密配置，合并 Nginx 统计采集限流并通过 nginx -t；旧哈希静态资源保留。
- 公网管理员登录返回 ADMIN；统计汇总、访问记录、历史读取、未登录隔离和 OAuth 跳转验证通过。浏览器实际点击“访问统计”进入看板成功，未创建模型任务。
- 后端 SHA-256：4ec397beea2d221fef8942ace51e3065c14b24302f6ff44275d5208ff6f7a712。
- 前端入口 SHA-256：800be234ce21ea9306817929721b7adc0661e8b0531254e4a4e2737fec15a78f。

用户需刷新页面并重新登录管理员账号。统计从上线后开始采集，不导入本地测试数据，不回填旧访问量。
# 2026-09-14 12:50（北京时间）：新手教程发布

按用户授权发布当前工作区版本，源提交 `5580324b0d2a0966aa0cbf343beaa9fcc539979a`，包含未提交修改（dirty=true）。上线独立 RAG 示例教程、内容介绍步骤、可滚动高亮引导和收藏回看完成流程。

- 发布前后端 266 项测试通过；前端 lint、typecheck、build 和桌面/手机宽度教程完整流程验证通过。
- 备份：`/var/backups/knowledgesteps/tutorial-20260914T045003Z`，包含旧前后端、数据库和私密配置。
- 暂停任务提交并等待在途任务结束后更新；服务于 04:50:10 UTC 启动。Flyway 从 V12 升至 V13，数据库完整性与外键检查通过，原有业务表记录数量一致。
- 199 个安装文件哈希全部匹配发布包；公网站点 `/tutorial` 入口哈希一致，未登录教程接口返回 401，健康检查 UP。
- 保留原私密配置和 Nginx 配置，恢复任务提交入口，保留旧版哈希资源。后端重启后原登录会话需要重新登录。
- 后端 SHA-256：`497c41d74466abd72e2ea76117caf14ba818be423423ede6db66275c9b61bcf3`。
- 前端入口 SHA-256：`f3c2fd29c3257bf83365b4e311e6da54f1664459927aff214b56602a0d673184`。

线上检查未使用真人账号执行教程或调用模型；完整教程交互在本地浏览器使用隔离的模拟登录验证。

## 2026-09-15 02:32（北京时间）：个性化自评、知识卡片与资料推荐发布

按用户授权发布当前工作区版本，源提交 `0c10108a2ac8e76dd147bb8478b61e0f313f5914`，包含未提交修改（dirty=true）。本次上线概念判断自评、按熟练度生成知识卡片、知乎资料短推荐理由、新手教程及图谱和移动端交互修复。

- 发布前后端 Maven verify 共 269 项测试通过；前端 lint、typecheck、49 项测试及 API 模式生产构建通过；运维工具 7 项测试通过。
- 发布包包含 200 个文件并通过 manifest 校验。备份目录为 `/var/backups/knowledgesteps/recommendations-20260914T183233Z`，包含发布前数据库、后端、前端入口、Nginx 和私密配置。
- 暂停写请求并确认在途任务为 0 后切换。服务于 18:32:36 UTC 启动，数据库从 V13 升至 V16，完整性检查、字段检查和业务表记录数量核对通过。
- 后端 SHA-256：`57e36ad8987f1f844cab901b2403ae4893cab816c3cc82b38557be0946576b0d`。
- 前端入口 SHA-256：`02f1e973fc5ddd493415e2fbc18b03d265ef5e24b3a1e81d20267af063e57139`。
- 公网首页、登录、教程、历史、问卷和结果子路由均返回新入口；未登录 API 返回 401 JSON，知乎 OAuth 入口返回 303。后端健康检查为 UP，NRestarts 为 0。

本次没有使用真人账号发起新的模型任务；已部署的模型调用仍需结合实际上游服务进行持续观察。后端重启后原内存登录会话失效，用户需要重新登录。
