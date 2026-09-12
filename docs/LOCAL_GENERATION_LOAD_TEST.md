# 本地四线程寻路压测

日期：2026-09-13。仅修改及验证本地版本，未部署线上。

## 配置与范围

生成线程默认 4 个，环境变量 `GENERATION_WORKERS` 可调整，等待队列 8 个。使用独立端口 8081、独立数据库 `backend/target/four-workers-load.db`，管理员真实登录后调用真实模型，目标为 Transformer。测试截至问卷 READY，不包含答题后知乎资料搜索。现有 8080 服务未重启。

JVM：`-Xms64m -Xmx320m -XX:+UseSerialGC -XX:MaxMetaspaceSize=160m -XX:ReservedCodeCacheSize=64m -Xss512k -XX:ActiveProcessorCount=2`，数据库连接池上限 4。ActiveProcessorCount 只调整 JVM 感知处理器数，并非 CPU 或整机内存资源限额；Windows 本地结果不能替代 Azure 1 GiB 主机测试。

## 结果

| 场景 | 提交耗时 | 至问卷可用耗时 | 结果 |
| --- | --- | --- | --- |
| 单任务基线 | 39 ms | 15.2 秒 | 成功 |
| 4 个同时提交：任务一 | 8 ms | 21.4 秒 | 成功 |
| 4 个同时提交：任务二 | 12 ms | 27.5 秒 | 成功 |
| 4 个同时提交：任务三 | 15 ms | 39.6 秒 | 成功 |
| 4 个同时提交：任务四 | 18 ms | 42.6 秒 | 成功 |

五次全部生成成功；这只是小样本验证，不能据此保证长期成功率。四任务批次约 43 秒全部完成，线程转储确认存在四个生成线程。生成期间采样工作集约 190–196 MiB，进程生命周期峰值工作集 205.6 MiB；未发现数据库锁错误或模型限流，结束后健康检查 UP。一次图谱触发深度优化，最终成功。

后端 `mvn verify`：122 项测试通过。容量测试使用阻塞任务验证四个任务能同时执行，八个等待任务占满队列后，第十三个请求返回 429 且不创建额外记录。没有通过大量真实模型调用来测试队列拒绝，以控制额度消耗。

原始结果及运行日志保留在 `backend/target/local-four-workers-results.json`、`backend/target/four-workers-server.log`，target 为本地构建目录，清理构建时会删除。测试服务完成后停止，测试数据库保留。
