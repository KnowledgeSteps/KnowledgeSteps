# 知阶 KnowledgeSteps

每一个知识，都有它的台阶。

一次性知识寻路工具：告诉我你想学什么，我只告诉你还缺什么。
输入目标后生成前置依赖、搜索知乎资料并完成自评，最终展示待补齐节点、目标及依赖关系。已掌握节点只隐藏，不删除记录。

当前已实现创建寻路任务、查询状态、答卷读取、答案保存、结果生成与节点资料读取，以及“模型生成依赖图 → 校验分层 → 知乎搜索 → 生成自评题”的异步链路。OAuth 登录仍待实现。本地开发用 local-test 测试身份；普通配置未登录返回 401。产品范围见 [项目计划](docs/PROJECT.md)，接口及 Apifox 调试步骤见 [接口约定](docs/API_CONTRACT.md)。

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

本地凭证：复制 `backend/secrets.properties.example` 为 `backend/secrets.properties`，在等号后填写知乎和硅基流动密钥，不加引号。该私密文件已被 Git 忽略，后端从工作目录自动读取；不要填写到示例文件或强制加入 Git。IDEA 工作目录设置为 `$PROJECT_DIR$/backend`，普通启动时有效配置文件保持为空。

## 协作流程

每个成员在个人 Fork 的 `main` 开发，推送个人 Fork 后向组织仓库 `main` 提交 PR。PR 必须通过自动检查并获得至少一位队友审查，之后使用 Squash and merge 合入 `main`。操作前用 `git remote -v` 核实远程地址。

分支、Commit、PR、代码审查和合并规范请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

详细部署配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。
