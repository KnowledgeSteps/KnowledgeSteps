# 知乎 OAuth 登录

## 当前状态

2026-09-13 已实现前后端接入并部署到 `https://ksteps.yinbo.online`。授权发起、非法回调拒绝与安全 Cookie 已在线验证。北京时间 14:28:58 真实知乎授权成功，服务端已建立独立账户并保存有效昵称与 HTTPS 头像。

应用 ID 为 `459`。在知乎应用配置中登记的回调地址必须完全一致：

```text
https://ksteps.yinbo.online/api/v1/auth/zhihu/callback
```

## 登录流程

1. 登录页按钮进入 `GET /api/v1/auth/zhihu/start`。服务端生成 32 字节随机 state，绑定当前浏览器会话，有效期 10 分钟。
2. 浏览器跳转 `https://openapi.zhihu.com/authorize`，用户在知乎确认授权。
3. 后端回调优先读取 `authorization_code`，兼容 `code`，严格校验并一次性消费 state。
4. 后端向 `/access_token` 提交表单，字段为 `app_id`、`app_key`、`grant_type=authorization_code`、登记的 `redirect_uri` 和 `code`。
5. 使用换取的 OAuth Token 作为 Bearer 调用 `GET https://openapi.zhihu.com/user`。此基础身份接口不使用知乎搜索的 Access Secret，也不使用 `X-OAuth-Token`。
6. 校验稳定数字 `uid`，保存 `zhihu:<uid>`、昵称和安全头像地址。轮换应用 Session 和 CSRF Token，跳转回首页、历史或合法寻路页面。

`uid` 在 Java 端无损读取，不经 JavaScript Number 转换；缺失有效 uid 时拒绝建立身份。用户名变化不会新建账户，相同昵称也不会合并账户。管理员与知乎账号分别保留历史，不能通过姓名关联。

## 私密配置

可使用服务端环境变量：

```text
ZHIHU_OAUTH_ENABLED=true
ZHIHU_OAUTH_APP_ID=459
ZHIHU_OAUTH_APP_KEY=<仅由服务器 Secret 注入>
ZHIHU_OAUTH_REDIRECT_URI=https://ksteps.yinbo.online/api/v1/auth/zhihu/callback
```

对应 Spring 配置为 `auth.zhihu.enabled/app-id/app-key/redirect-uri`。当前线上保存在 `/etc/knowledgesteps/application.properties`，由 root 与服务账号读取。不要打印该文件、提交私密配置、向前端注入 App Key 或共享带授权码的回调地址。

本地可复制 `backend/oauth.properties.example` 到被 Git 忽略的 `backend/oauth.properties`。本地 HTTP 回调仅允许 localhost/127.0.0.1；要真实登录，仍须在知乎应用中登记对应地址。生产回调与 localhost 不是同一浏览器会话，不能用生产回调验证本地登录。无需改回调的开发验证可使用自动化模拟接口测试。`local-test` 自动身份模式与 OAuth 禁止同时启用。

## 安全边界与失败处理

- 不读取关注、收藏、邮箱、手机号；OAuth Token 仅在后端换取基础资料，完成后不落库、不保存在浏览器。
- 应用登录沿用 30 分钟空闲过期的 Session；退出或服务重启清除登录态。
- state 必须由知乎原样回传。历史官方资料记载过不返回 state 的情况，**不能用“已有 Cookie”代替校验，也不能在缺失 state 时绕过检查**。若真实联调仍缺失，需平台提供可靠请求关联能力后才能完成上线验收。
- state 过期、错误、重放、跨浏览器或被新授权取代时拒绝登录；较早的授权响应不能恢复已退出或已切换的身份。
- 回调不回显上游错误、授权码或令牌。返回 `/login?oauthError=...` 时前端只展示固定中文提示。
- Nginx 对 OAuth 发起/回调执行登录入口 IP 限流；后端同时交换上限为 4，网络请求设有超时，不自动重复消费授权码。
- Nginx 普通访问日志不记录 Query 与 Referer；回调与限流错误位置关闭访问日志。应用日志只记录固定结果类别，不记录凭证、请求地址或上游响应。

## 本次验收与部署

- 后端 180 项测试通过，包含授权协议、稳定身份、历史隔离、state、会话轮换、并发回调和旧流程失效。
- 前端 19 项回归以及 lint、typecheck、build 通过；桌面与窄屏模拟渲染验证通过，未替代真实授权。
- 线上发起返回 303，包含正确应用 ID、登记回调和随机 state；Cookie 为 Secure，响应 no-store/no-referrer。错误 state 无法登录，`/auth/me` 仍为 401。
- 部署前备份：`/var/backups/knowledgesteps/oauth-20260913T062753Z`。未修改数据库结构、未迁移或删除既有用户历史。
- 真实授权回调已通过 state 校验，并成功换取基础资料、建立会话；只读数据库确认 1 个知乎账户，昵称及 HTTPS 头像均存在。
- 用户已确认真实授权后回到知阶，昵称与头像正常显示。重复登录的身份稳定性和历史隔离已通过自动化测试。

协议依据为知乎官方 Skill 的 `hackathon-oauth.md` 与新增 `hackathon-user-profile-api.md`；最新资料包来自 [知乎官方发布地址](https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/skill/zhihu-cli-skill.zip)。
