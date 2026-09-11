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
