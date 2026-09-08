# 数据库初始化与迁移

后端已接入 Flyway，启动时从 `classpath:db/migration` 执行 SQL；Spring 的 schema.sql 初始化已关闭。无需单独安装 Flyway 命令行。

## 新数据库

使用 JDK 21，在 backend 目录执行：

```powershell
.\mvnw.cmd spring-boot:run
```

确保 data 目录存在。IDEA 工作目录设置为 `$PROJECT_DIR$/backend`。V1 创建七张新业务表，V2 创建旧仓储依赖的 learning_records 表。flyway_schema_history 自动记录版本和校验和，重新启动不会重复执行。

## 已有数据库首次接入

先停止后端并备份数据库。仅当旧库只有原来的 learning_records 业务表、尚无 Flyway 历史记录时，使用以下一次性参数：

```powershell
$env:FLYWAY_BASELINE_ON_MIGRATE = 'true'
.\mvnw.cmd spring-boot:run
```

完成后停止进程，删除本次环境变量，再正常启动：

```powershell
Remove-Item Env:FLYWAY_BASELINE_ON_MIGRATE
.\mvnw.cmd spring-boot:run
```

IDEA 可在运行配置的环境变量中临时添加 `FLYWAY_BASELINE_ON_MIGRATE=true`，首次升级成功后移除。

基线固定为 0，因此 V1、V2 都会执行。不能使用基线 1，否则会跳过七张表的创建。默认不自动接管非空库，以免连错数据库。若手动执行过 V1 或已有其他业务表，先核对实际表结构与迁移历史，不直接启用基线、不删除数据或历史表。

## 后续变更

新增 `V3__描述.sql` 等脚本；已应用的脚本不能修改。团队协调版本号，校验失败先排查原因，不直接 repair。每个连接由连接池启用外键，网络请求不应占用数据库事务。

SQLite 不支持多个实例同时执行迁移，部署时串行启动。参考：[Flyway SQLite 官方说明](https://documentation.red-gate.com/flyway/reference/database-driver-reference/sqlite)。

验证命令：`.\mvnw.cmd --batch-mode clean verify`。测试使用临时数据库，不操作本地业务库。
