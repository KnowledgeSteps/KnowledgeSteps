package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/** 仅由后端在 OAuth 身份验证完成后调用 establish，不提供浏览器设置用户 ID 的入口。 */
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
    if (old != null) old.invalidate();
    request.getSession(true).setAttribute(USER_ID, verifiedUserId);
    csrf.issue(request);
  }
  public void logout(HttpServletRequest request) {
    var session = request.getSession(false);
    if (session != null) session.invalidate();
  }
}
