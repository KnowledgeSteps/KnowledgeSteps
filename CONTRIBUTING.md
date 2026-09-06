# 开发与协作规范

本文档说明团队成员如何获取代码、开发功能、提交改动和合并 PR。所有成员都应遵守同一套流程，避免直接修改 `main` 分支。

## 一、准备自己的仓库

1. 在 GitHub 打开主仓库，点击 **Fork**，创建一份属于自己的仓库。
2. 将自己的 Fork 克隆到本地：

```bash
git clone https://github.com/你的用户名/Hackathon.git
cd Hackathon
```

3. 把团队主仓库添加为 `upstream`：

```bash
git remote add upstream https://github.com/yin-bo-Final/Hackathon.git
git remote -v
```

其中，`origin` 指向自己的 Fork，`upstream` 指向团队主仓库。

## 二、开始开发

每次开发前先同步最新的 `main`：

```bash
git switch main
git fetch upstream
git pull --ff-only upstream main
git push origin main
```

从最新的 `main` 创建独立分支：

```bash
git switch -c feat/learning-cards
```

分支名称使用小写英文和连字符，推荐格式如下：

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| `feat/` | 新功能 | `feat/learning-cards` |
| `fix/` | 修复问题 | `fix/oauth-callback` |
| `docs/` | 文档修改 | `docs/api-guide` |
| `refactor/` | 代码重构 | `refactor/search-service` |
| `test/` | 测试调整 | `test/user-isolation` |
| `chore/` | 工程配置 | `chore/update-dependencies` |

一个分支只处理一项明确任务，不要把无关改动放进同一个 PR。

## 三、提交代码

提交前先检查改动：

```bash
git status
git diff
```

提交信息统一使用以下格式：

```text
类型: English description/中文说明
```

常用类型：

| 类型 | 用途 | 示例 |
| --- | --- | --- |
| `Feat` | 新增功能 | `Feat: add learning cards/新增学习卡片` |
| `Fix` | 修复问题 | `Fix: fix login callback/修复登录回调` |
| `Docs` | 修改文档 | `Docs: update deployment guide/更新部署指南` |
| `Refactor` | 重构代码 | `Refactor: simplify search service/简化搜索服务` |
| `Test` | 补充或修改测试 | `Test: cover user isolation/补充用户隔离测试` |
| `Chore` | 工程配置或维护 | `Chore: update dependencies/更新依赖` |
| `CI` | 持续集成或部署 | `CI: add backend checks/增加后端检查` |

完成提交后，将分支推送到自己的 Fork：

```bash
git push -u origin feat/learning-cards
```

不要把密钥、Token、密码、真实用户数据、本地数据库、依赖目录或构建产物提交到仓库。

## 四、创建 PR

在 GitHub 上从自己 Fork 的功能分支向团队主仓库的 `main` 创建 PR。

PR 标题与提交信息使用相同格式：

```text
类型: English description/中文说明
```

PR 正文必须使用中文，并按自动出现的模板详细填写：

- 改动目的和对应的使用场景。
- 主要改动及前后端影响范围。
- 可以复现的验证步骤、命令和实际结果。
- 接口、数据库、环境变量和部署配置变化。
- 页面截图、演示链接、已知问题和后续工作。

请使用标准 Markdown 和真实换行，不要把字面量 `\n` 写进正文。一个 PR 只解决一个主题，较大的功能应拆分为可以独立审查的小 PR。

## 五、本地检查

修改前端代码时执行：

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
```

修改后端代码时执行：

```bash
cd backend
./mvnw --batch-mode verify
```

Windows PowerShell 使用：

```powershell
cd backend
.\mvnw.cmd --batch-mode verify
```

涉及页面和接口联调时，还要实际启动前后端，检查核心页面、接口响应和失败提示。

## 六、审查与合并

PR 创建后按以下顺序处理：

1. 等待 GitHub Actions 完成前端检查、后端测试和打包。
2. 至少邀请一位队友审查代码。
3. 对每条审查意见进行修复或说明，并在确认处理完成后解决对应讨论。
4. 代码更新后再次确认所有自动检查通过。
5. 使用 **Squash and merge** 合并到 `main`。
6. 合并后删除已经完成的功能分支，并在开始下一项任务前重新同步 `main`。

禁止绕过检查直接向 `main` 推送代码。发生冲突时，在自己的功能分支同步 `upstream/main` 并解决冲突，然后重新推送。

## 七、CI/CD 流程

```text
个人提交 PR
    ↓
自动检查 + 队友审查
    ↓
合并 main
    ↓
主分支检查与打包
    ↓
自动部署
    ↓
后端健康检查 + 前端核心页面检查
```

部署工作流默认关闭。仓库管理员配置 GitHub Secrets，并将仓库变量 `DEPLOY_ENABLED` 设置为 `true` 后才会执行自动部署。具体配置见 [部署说明](docs/DEPLOYMENT.md)。

## 八、Bot 审查

Codex 会自动审查进入可审查状态的 PR，也可以在 PR 中评论以下内容手动触发：

```text
@codex review 请按照 AGENTS.md 使用简体中文审查
```

Codex 的审查语言和检查重点由根目录的 [AGENTS.md](AGENTS.md) 规定。Bot 审查用于辅助发现问题，不能代替队友审查和实际测试。
