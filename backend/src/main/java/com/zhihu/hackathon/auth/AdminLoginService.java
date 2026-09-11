package com.zhihu.hackathon.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** 单账号临时登录；提供内部身份，不赋予跨用户读取任务的权限。 */
@Service
public class AdminLoginService {
  private final AuthUserStore users;
  private final boolean enabled;
  private final String username;
  private final AdminPassword password;
  private final Clock clock;
  private long windowStart;
  private int attempts;

  @Autowired
  public AdminLoginService(AuthUserStore users,
      @Value("${auth.admin.enabled:false}") boolean enabled,
      @Value("${auth.admin.username:admin}") String username,
      @Value("${auth.admin.password-hash:}") String passwordHash) {
    this(users, enabled, username, passwordHash, Clock.systemUTC());
  }

  AdminLoginService(AuthUserStore users, boolean enabled, String username, String passwordHash, Clock clock) {
    this.users = users;
    this.enabled = enabled;
    this.username = username;
    this.clock = clock;
    this.windowStart = clock.millis();
    if (enabled && (username == null || !username.matches("[A-Za-z0-9._-]{3,64}"))) {
      throw new IllegalArgumentException("Invalid auth.admin.username configuration");
    }
    this.password = enabled ? new AdminPassword(passwordHash) : null;
  }

  public long login(String suppliedUsername, String suppliedPassword) {
    acquireAttempt();
    boolean passwordMatches = password.matches(suppliedPassword);
    boolean usernameMatches = suppliedUsername != null && suppliedUsername.length() <= 64
        && MessageDigest.isEqual(username.getBytes(StandardCharsets.UTF_8), suppliedUsername.getBytes(StandardCharsets.UTF_8));
    if (!passwordMatches || !usernameMatches) {
      throw new AuthException(401, "INVALID_CREDENTIALS", "账号或密码不正确。");
    }
    return users.adminUser(username);
  }

  private synchronized void acquireAttempt() {
    if (!enabled) throw new AuthException(503, "ADMIN_LOGIN_DISABLED", "管理员登录暂未开启。");
    long now = clock.millis();
    if (now - windowStart >= 60_000 || now < windowStart) {
      windowStart = now;
      attempts = 0;
    }
    // 单实例全局限制，避免更换 Cookie 或用户名绕过尝试次数。
    if (attempts >= 10) throw new AuthException(429, "LOGIN_RATE_LIMITED", "登录尝试过于频繁，请一分钟后重试。");
    attempts++;
  }
}
