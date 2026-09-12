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
