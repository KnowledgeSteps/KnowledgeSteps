# 知阶 KnowledgeSteps

每一个知识，都有它的台阶。

一次性知识寻路工具：告诉我你想学什么，我只告诉你还缺什么。
输入目标后生成前置依赖、搜索知乎资料并完成自评，最终展示待补齐节点、目标及依赖关系。已掌握节点只隐藏，不删除记录。

当前已实现六个寻路接口、管理员密码登录，以及“模型生成依赖图 → 校验分层 → 知乎搜索 → 生成自评题”的异步链路。知乎 OAuth 登录仍待实现。管理员登录使用真实会话；local-test 提供独立的自动测试身份，两者不能同时开启。产品范围见 [项目计划](docs/PROJECT.md)，接口及 Apifox 调试步骤见 [接口约定](docs/API_CONTRACT.md)。

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

管理员登录本地联调：先在 backend 目录运行一次 `powershell -ExecutionPolicy Bypass -File scripts/setup-admin-login.ps1`，生成随机密码与 PBKDF2 密码哈希。账号和初始密码见本机 `backend/admin-credentials.txt`，后端哈希配置在 `backend/admin-login.properties`；两者均被 Git 忽略。脚本拒绝覆盖已有配置，不会改动知乎或模型密钥。

后端使用 `admin-local` 配置启动：`.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=admin-local"`。IDEA 工作目录仍为 `$PROJECT_DIR$/backend`，有效配置文件填写 `admin-local`，不要同时填写 `local-test`。前端设置 `VITE_DATA_MODE=api` 后运行，统一入口为 `/login`，左下角“管理员登录”打开账号密码弹窗。原 local-test 用户的任务不会自动转给管理员。

未登录访问首页、答卷、结果或其他路径都会进入统一登录页；已登录访问登录页会回到业务页面，退出后返回登录页。Mock 仅替换学习数据，也需要真实后端登录，不再提供免登录入口。知乎授权按钮暂时显示申请中提示，尚未接通 OAuth。按钮与弹窗复用 [Uiverse 组件](https://uiverse.io/pharmacist-sabot/funny-gecko-48)，许可随 `frontend/public/uiverse.LICENSE` 发布。

演示站点使用 `admin-login` 配置，强制 Secure Cookie；需要 HTTPS 和同源 `/api` 代理，详情见部署说明。管理员只是独立的团队登录账号，不具有跨用户读取任务的权限。

本地凭证：复制 `backend/secrets.properties.example` 为 `backend/secrets.properties`，在等号后填写知乎和硅基流动密钥，不加引号。该私密文件已被 Git 忽略，后端从工作目录自动读取；不要填写到示例文件或强制加入 Git。IDEA 工作目录设置为 `$PROJECT_DIR$/backend`，普通启动时有效配置文件保持为空。

## 协作流程

每个成员在个人 Fork 的 `main` 开发，推送个人 Fork 后向组织仓库 `main` 提交 PR。PR 必须通过自动检查并获得至少一位队友审查，之后使用 Squash and merge 合入 `main`。操作前用 `git remote -v` 核实远程地址。

分支、Commit、PR、代码审查和合并规范请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

详细部署配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 前端视觉规范

所有页面统一使用 Ant Design、Ant Design Icons、Chillax（英文与数字）和思源黑体（中文），保持白底与 #AFD0FC / #629FFC / #2977F8 蓝色体系，不使用渐变。主题集中在 [theme.ts](frontend/src/design/theme.ts)，后续页面遵循 [UI 规范](frontend/docs/UI_DESIGN.md)。

`npm run dev` / `npm run build` 会自动准备 Chillax 字体，首次执行需要访问 Fontshare 官方 CDN，后续使用本地缓存。字体二进制按许可忽略 Git；部署构建会包含字体。`npm run lint` 同时检查基础视觉约束。
