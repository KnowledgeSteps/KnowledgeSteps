package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminLoginController {
  private final AdminLoginService login;
  private final SessionAuthentication sessions;
  private final CsrfTokens csrf;

  public AdminLoginController(AdminLoginService login, SessionAuthentication sessions, CsrfTokens csrf) {
    this.login = login;
    this.sessions = sessions;
    this.csrf = csrf;
  }

  // 使用普通类，避免 record 自动生成的 toString 包含密码。
  public static final class LoginRequest {
    public String username;
    public String password;
  }

  @PostMapping("/api/v1/auth/admin/login")
  public ResponseEntity<?> login(@RequestBody LoginRequest body, HttpServletRequest request) {
    csrf.verify(request);
    long userId = login.login(body == null ? null : body.username, body == null ? null : body.password);
    sessions.establish(request, userId);
    return ResponseEntity.ok().header("Cache-Control", "no-store")
        .body(sessions.userResponse(request, userId));
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<?> malformed() {
    return ResponseEntity.badRequest().header("Cache-Control", "no-store")
        .body(Map.of("error", Map.of("code", "INVALID_LOGIN_REQUEST", "message", "登录请求格式不正确。")));
  }
}
