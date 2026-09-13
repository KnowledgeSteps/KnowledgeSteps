# 部署说明

当前部署架构为 Azure Ubuntu 22.04、Nginx、Java 21 与 SQLite 单实例，站点为 https://ksteps.yinbo.online 。公开身份使用知乎 OAuth，管理员登录作为独立入口；配置见 [知乎登录说明](ZHIHU_OAUTH.md)。历次发布及当时的验证结果保存在 [部署历史](DEPLOYMENT_HISTORY.md)。

**2026-09-13 17:10（北京时间）已部署本轮审查修复及二次补修，后端服务已重启，每日同机数据库备份已启用并首次执行成功。** 未重启整台服务器；原登录会话需重新登录。修复与验证见 [审查修复进度](REVIEW_FIX_PROGRESS.md)，版本和备份位置见 [部署历史](DEPLOYMENT_HISTORY.md)。

## 运行目录与配置

| 项目 | 路径或设置 |
| --- | --- |
| 前端 | `/var/www/knowledgesteps`，同域 `/api/` 由 Nginx 代理 |
| 后端 | `/opt/knowledgesteps/app.jar`，仅监听 `127.0.0.1:8080` |
| 私密配置 | `/etc/knowledgesteps/application.properties`，仅 root 与服务账号可读 |
| SQLite | `/var/lib/knowledgesteps/hackathon.db`，持久化目录，不打进镜像 |
| 服务 | `knowledgesteps.service`，服务账号 `knowledgesteps` |
| 前端构建变量 | `VITE_DATA_MODE=api`、`VITE_API_BASE_URL` 为空 |

生产启用 Secure、HttpOnly、SameSite=Lax Cookie，写接口校验 CSRF。禁止 `local-test` 或 `admin-local` 进入生产。管理员共享账号的使用者共享历史与用户配额；知乎用户按独立身份隔离。后端会话在内存中，重启后需要重新登录。

模型默认 base URL 为 `https://api.openai-next.com/v1`，图谱 `gemini-3-flash`、问卷 `gemini-3.1-flash-lite`；实际运行值以私密配置为准，不能仅根据代码默认值判断线上使用哪个 Key。所有供应商凭证只留在服务端，不放入 VITE 变量或产物。

默认四工作线程、八个等待位置，每用户两个在途任务、一分钟最多成功创建十次、最多二十条历史。生成总时限默认 300 秒，搜索独立时限默认 180 秒，包含排队、不含答题等待。详见 [防护策略](PROTECTION_STRATEGY.md)。雪花 ID 节点号 `SESSION_ID_WORKER_ID` 默认为 0；API ID 始终使用字符串。数据库迁移当前 V1–V7，不修改已应用的迁移。

Nginx 模板为 `deploy/ksteps-https.conf`，需要从 `http` 上下文加载。当前模板基于直连来源 IP；启用 CDN 前须恢复并验证可信代理链，不能直接信任公网提交的 X-Forwarded-For。`prepare-azure.sh` 仅用于首次引导，日常更新不要重跑，以免覆盖 HTTPS 配置。

## 验证并打包同一份产物

`.github/workflows/deploy.yml` 现在只负责校验与构建发布包，不再使用 Vercel 二次构建或无提交约束的后端 Webhook，也不会自动安装到 Azure。合并 main 或手动运行后，完成前端 lint/typecheck/test/build、后端 verify 及运维工具测试，再打包原产物。

产物名为 `knowledgesteps-<完整提交 SHA>`，包含 `frontend/`、`app.jar`、`manifest.json`。manifest 记录源提交、工作区是否有未提交修改和每个文件的 SHA-256；不包含数据库或私密配置。不要用重新构建的产物替换已验证包。

本地对应命令（Python 3.10+）：

```text
python deploy/release_artifact.py package backend/target/release-review --allow-dirty
python deploy/release_artifact.py verify backend/target/release-review
```

这两个命令不会执行测试，必须先完成前后端检查与构建。输出目录必须不存在；本地审查中的未提交内容必须用 `--allow-dirty` 显式标记，不能把它描述为纯提交构建。正式发布使用干净提交和对应 CI 产物，核对 Actions 运行的提交 SHA、manifest 和下载来源。SHA 清单能发现传输或混用错误，本身不是数字签名。

## SQLite 备份与恢复演练

工具 `deploy/database_backup.py` 仅依赖 Python 标准库，可在有 WAL 写入时取得一致快照，检查 `quick_check` 与外键，校验通过后才发布文件；复制阶段设置 60 秒时限。默认保留本工具生成的最新七份快照，不删除人工命名的备份或其他目录文件。Linux 文件以仅当前用户可读写的权限创建。

以下是后续在服务器上执行的命令，本轮没有执行：

```bash
sudo -u knowledgesteps python3 /opt/knowledgesteps/database_backup.py backup \
  /var/lib/knowledgesteps/hackathon.db /var/lib/knowledgesteps-backups --keep 7
python3 /opt/knowledgesteps/database_backup.py verify /path/to/snapshot.db
python3 /opt/knowledgesteps/database_backup.py restore /path/to/snapshot.db /path/to/new-restored.db
```

`restore` 拒绝覆盖任何已有路径，并拒绝目标旁残留的 `-wal`、`-shm`、`-journal`（含符号链接）；不会删除这些旧文件。快照先在私有空目录生成，发布前再次检查目标，发布后重新校验完整性并比较表结构和全部行的逻辑摘要。不一致时撤回本工具刚创建的目标，不报告成功。恢复路径必须保持无人使用，不得与正在运行的 SQLite 进程共用。

演练使用新的临时路径，核对表数量、Flyway 版本、账户与历史记录，再用隔离配置启动验证。不要让演练实例调用真实供应商。

需要实际回滚数据库时：先暂停新请求并停止服务，另备份当前数据；保留当前数据库及其 WAL/SHM 为同一组，再切换到验证过的恢复文件，设置所属用户后启动。不能直接把旧主库覆盖在新 WAL/SHM 上。数据库回滚会丢失快照之后的变更，优先只回滚兼容的应用产物。

定时模板为 `deploy/knowledgesteps-backup.service` 与 `.timer`，计划每天服务器本地时间 04:00 加最多 15 分钟随机延迟。后续安装时将脚本放到 `/opt/knowledgesteps/database_backup.py`、unit 放到 `/etc/systemd/system/`，验证服务后再启用 timer。使用 `systemctl list-timers` 和 `journalctl -u knowledgesteps-backup` 验证真实执行结果；模板存在不代表已定时备份。

同机快照不能抵御整机或磁盘丢失。正式安装时还需把验证过的快照复制到受控异机存储，核对哈希，并定期恢复演练。按七份快照保留策略，历史删除不会立即抹去旧快照里的数据；恢复前需考虑删除记录的恢复风险。

## 手动更新与验收

1. 确认发布包的提交与测试结果，检查清单；维护窗口暂停创建和完成提交，等待在途任务退出。
2. 备份 SQLite、当前前端、后端和配置。配置含密钥，备份不可公开下载。
3. 上传同一发布包到独立暂存目录，再运行 `release_artifact.py verify`；保留数据库和私密配置。
4. 替换已验证 jar，启动服务并确认 Flyway 和健康检查；前端先传资源，最后原子切换 `index.html`。保留旧版哈希资源一段时间，让已打开页面完成加载。
5. 若调整 Nginx，先 `nginx -t`，通过后重载。核对代理、安全响应头、OAuth 回调日志抑制及 IP 限流。
6. 验证首页、登录与子路由刷新、生成、自评、资料查看、历史删除、权限隔离及移动端操作；正常后恢复创建入口。

后端检查：`systemctl status knowledgesteps`、`curl http://127.0.0.1:8080/actuator/health`。公网健康不能单独证明版本正确；还应核对本机 jar、前端入口与资源哈希。诊断日志按 X-Request-ID 关联，不向公网开放指标端点或测试接口。失败时使用保存的上一版产物回退，不覆盖新数据库。
