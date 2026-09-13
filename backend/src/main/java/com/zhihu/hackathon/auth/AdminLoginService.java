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
  private final AdminLoginAttempts attempts;

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
    this.attempts = new AdminLoginAttempts(clock);
    if (enabled && (username == null || !username.matches("[A-Za-z0-9._-]{3,64}"))) {
      throw new IllegalArgumentException("Invalid auth.admin.username configuration");
    }
    this.password = enabled ? new AdminPassword(passwordHash) : null;
  }

  public long login(String source, String suppliedUsername, String suppliedPassword) {
    if (!enabled) throw new AuthException(503, "ADMIN_LOGIN_DISABLED", "管理员登录暂未开启。");
    var attempt = attempts.acquire(source);
    boolean invalidCredentials = false;
    try {
      boolean passwordMatches = password.matches(suppliedPassword);
      boolean usernameMatches = suppliedUsername != null && suppliedUsername.length() <= 64
          && MessageDigest.isEqual(username.getBytes(StandardCharsets.UTF_8), suppliedUsername.getBytes(StandardCharsets.UTF_8));
      invalidCredentials = !passwordMatches || !usernameMatches;
      if (invalidCredentials) {
        throw new AuthException(401, "INVALID_CREDENTIALS", "账号或密码不正确。");
      }
    } finally {
      attempts.finish(attempt, invalidCredentials);
    }
    return users.adminUser(username);
  }
}
