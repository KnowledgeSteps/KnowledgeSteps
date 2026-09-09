package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {
  private final CurrentUserProvider users;
  private final CsrfTokens csrf;
  private final SessionAuthentication sessions;
  public AuthController(CurrentUserProvider users, CsrfTokens csrf, SessionAuthentication sessions) {
    this.users = users; this.csrf = csrf; this.sessions = sessions;
  }
  @GetMapping("/api/v1/auth/me")
  public ResponseEntity<?> me(HttpServletRequest request) {
    long userId = users.currentUserId();
    return ResponseEntity.ok().header("Cache-Control", "no-store")
        .body(Map.of("userId", Long.toString(userId), "csrfToken", csrf.issue(request)));
  }
  @PostMapping("/api/v1/auth/logout")
  public ResponseEntity<Void> logout(HttpServletRequest request) {
    users.currentUserId(); csrf.verify(request); sessions.logout(request);
    return ResponseEntity.noContent().header("Cache-Control", "no-store").build();
  }
}
