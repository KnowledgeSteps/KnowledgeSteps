# 知乎黑客松 知识炼金场

使用用户授权的知乎收藏、创作与关注内容，构建可追溯的个性化学习体验。

## 目录

```text
frontend/           React + TypeScript
backend/            Java + Spring Boot + SQLite
docs/               接口与部署说明
.github/workflows/  GitHub Actions CI/CD
CONTRIBUTING.md      开发与协作规范
```

## 本地启动

前端：

```bash
cd frontend
npm ci
npm run dev
```

后端：

```bash
cd backend
./mvnw spring-boot:run
```

Windows PowerShell 使用：

```powershell
cd backend
.\mvnw.cmd spring-boot:run
```

健康检查：`GET http://localhost:8080/actuator/health`。

## 协作流程

每个成员从最新的 `main` 创建功能分支，通过 PR 提交改动。PR 必须通过自动检查并获得至少一位队友审查，之后使用 Squash and merge 合入 `main`。

分支、Commit、PR、代码审查和合并规范请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

详细部署配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
