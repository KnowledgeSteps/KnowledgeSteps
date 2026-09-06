# 部署说明

## 前端

前端部署到 Vercel，Vercel 项目的 Root Directory 设置为 `frontend`。

## 后端与 SQLite

后端必须部署在支持 Java 或 Docker、并提供持久化磁盘的服务上。设置 `SQLITE_JDBC_URL`，例如：

```text
jdbc:sqlite:/var/lib/zhihu-learning/hackathon.db
```

不要把 SQLite 文件放在临时目录、容器镜像或 Git 仓库。单实例运行；每次数据库结构变更前备份数据文件。

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
