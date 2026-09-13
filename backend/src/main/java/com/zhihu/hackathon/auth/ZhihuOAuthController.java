package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.Semaphore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

/** OAuth code/token never enter the frontend API or application logs. */
@RestController
public class ZhihuOAuthController {
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ZhihuOAuthController.class);
  private static final String PENDING = "knowledgeSteps.oauth.pending";
  private static final String FLOW = "knowledgeSteps.oauth.flow";
  private static final Duration STATE_TTL = Duration.ofMinutes(10);
  private final SecureRandom random = new SecureRandom();
  private final Semaphore exchanges = new Semaphore(4);
  private final ZhihuOAuthClient client;
  private final AuthUserStore users;
  private final SessionAuthentication sessions;
  private final Clock clock;

  @Autowired
  public ZhihuOAuthController(ZhihuOAuthClient client, AuthUserStore users, SessionAuthentication sessions) {
    this(client, users, sessions, Clock.systemUTC());
  }
  ZhihuOAuthController(ZhihuOAuthClient client, AuthUserStore users, SessionAuthentication sessions, Clock clock) {
    this.client = client; this.users = users; this.sessions = sessions; this.clock = clock;
  }

  // 普通类避免默认 toString 打印 state。
  private static final class Pending {
    final String state;
    final String returnTo;
    final Instant expiresAt;
    Pending(String state, String returnTo, Instant expiresAt) {
      this.state = state; this.returnTo = returnTo; this.expiresAt = expiresAt;
    }
  }

  @GetMapping("/api/v1/auth/zhihu/start")
  public ResponseEntity<Void> start(HttpServletRequest request,
      @RequestParam(required = false) String returnTo) {
    String destination = safeReturnTo(returnTo);
    if (!client.enabled()) return failure("OAUTH_UNAVAILABLE", destination);
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    var session = request.getSession(true);
    synchronized (session) {
      var pending = new Pending(state, destination, clock.instant().plus(STATE_TTL));
      session.setAttribute(PENDING, pending);
      session.setAttribute(FLOW, pending);
    }
    return redirect(client.authorizationUri(state));
  }

  @GetMapping("/api/v1/auth/zhihu/callback")
  public ResponseEntity<Void> callback(HttpServletRequest request,
      @RequestParam(required = false) String state,
      @RequestParam(name = "authorization_code", required = false) String authorizationCode,
      @RequestParam(required = false) String code,
      @RequestParam(required = false) String error) {
    if (!client.enabled()) return failure("OAUTH_UNAVAILABLE", "/");
    Pending pending = null;
    var session = request.getSession(false);
    if (session != null) {
      synchronized (session) {
        if (session.getAttribute(PENDING) instanceof Pending value) pending = value;
        // 单次消费，重复回调和并发回调不能重复建立身份。
        session.removeAttribute(PENDING);
      }
    }
    if (pending == null || !clock.instant().isBefore(pending.expiresAt)
        || state == null || state.length() > 128
        || !MessageDigest.isEqual(pending.state.getBytes(StandardCharsets.UTF_8), state.getBytes(StandardCharsets.UTF_8))) {
      log.warn("Zhihu OAuth callback rejected: {}", state == null ? "missing_state" : "invalid_or_expired_state");
      return failure("OAUTH_STATE_INVALID", pending == null ? "/" : pending.returnTo);
    }
    if (error != null) return failure("OAUTH_CANCELLED", pending.returnTo);
    String grant = authorizationCode != null ? authorizationCode : code;
    if (grant == null || grant.isBlank() || grant.length() > 4096) return failure("OAUTH_FAILED", pending.returnTo);
    if (!exchanges.tryAcquire()) return failure("OAUTH_FAILED", pending.returnTo);
    try {
      var identity = client.authenticate(grant);
      synchronized (session) {
        // 退出、另一次成功登录或重新发起授权后，较早的网络响应不得恢复旧身份。
        if (session.getAttribute(FLOW) != pending) return failure("OAUTH_STATE_INVALID", pending.returnTo);
        long userId = users.zhihuUser(identity.id(), identity.nickname(), identity.avatarUrl());
        sessions.establish(request, userId, session);
      }
      log.info("Zhihu OAuth login established");
      return redirect(URI.create(pending.returnTo));
    } catch (RuntimeException exception) {
      // 不能将带 code/token 的上游异常、响应正文或请求 URL 写入日志。
      log.warn("Zhihu OAuth callback failed: identity_verification_or_session_changed");
      return failure("OAUTH_FAILED", pending.returnTo);
    } finally {
      exchanges.release();
    }
  }

  static String safeReturnTo(String value) {
    return value != null && (value.equals("/history") || value.equals("/doubts") || value.equals("/knowledge-cards") || value.equals("/admin/analytics") || value.matches("/sessions/[1-9][0-9]{0,18}/(questions|result)"))
        ? value : "/";
  }
  private ResponseEntity<Void> failure(String error, String returnTo) {
    return redirect(UriComponentsBuilder.fromPath("/login").queryParam("oauthError", error)
        .queryParam("returnTo", returnTo).build().encode().toUri());
  }
  private ResponseEntity<Void> redirect(URI uri) {
    return ResponseEntity.status(303).location(uri).header("Cache-Control", "no-store")
        .header("Pragma", "no-cache").header("Referrer-Policy", "no-referrer").build();
  }
}
