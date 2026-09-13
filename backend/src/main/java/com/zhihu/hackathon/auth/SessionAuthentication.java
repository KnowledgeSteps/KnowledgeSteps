package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/** 仅由后端在身份验证完成后调用 establish，不提供浏览器设置用户 ID 的入口。 */
@Component
public class SessionAuthentication {
  public static final String USER_ID = "knowledgeSteps.userId";
  private final AuthUserStore users;
  private final CsrfTokens csrf;
  public SessionAuthentication(AuthUserStore users, CsrfTokens csrf) { this.users = users; this.csrf = csrf; }
  public long currentUserId(HttpServletRequest request) {
    var session = request == null ? null : request.getSession(false);
    Object id = session == null ? null : session.getAttribute(USER_ID);
    if (!(id instanceof Long value) || value <= 0 || !users.isLoginUser(value)) throw AuthException.unauthorized();
    return value;
  }
  public void establish(HttpServletRequest request, long verifiedUserId) {
    if (!users.isLoginUser(verifiedUserId)) throw AuthException.unauthorized();
    var old = request.getSession(false);
    if (old != null) {
      synchronized (old) {
        old.getAttribute(USER_ID); // 已被另一次身份变更失效时，不允许旧请求再新建身份。
        old.invalidate();
        create(request, verifiedUserId);
      }
    } else create(request, verifiedUserId);
  }
  public void establish(HttpServletRequest request, long verifiedUserId, jakarta.servlet.http.HttpSession expected) {
    synchronized (expected) {
      if (request.getSession(false) != expected) throw AuthException.unauthorized();
      expected.getAttribute(USER_ID); // 容器过期等不经过应用锁的失效，同样拒绝。
      establish(request, verifiedUserId);
    }
  }
  private void create(HttpServletRequest request, long verifiedUserId) {
    request.getSession(true).setAttribute(USER_ID, verifiedUserId);
    csrf.issue(request);
  }
  public java.util.Map<String, String> userResponse(HttpServletRequest request, long userId) {
    var profile = users.profile(userId);
    String nickname = profile == null || profile.nickname() == null || profile.nickname().isBlank()
        ? "用户" : profile.nickname();
    String avatar = profile == null || profile.avatarUrl() == null ? "" : profile.avatarUrl();
    return java.util.Map.of("userId", Long.toString(userId), "csrfToken", csrf.issue(request),
        "nickname", nickname, "avatarUrl", avatar, "role", users.isAdmin(userId) ? "ADMIN" : "USER");
  }
  public void logout(HttpServletRequest request) {
    var session = request.getSession(false);
    if (session != null) synchronized (session) { session.invalidate(); }
  }
}
