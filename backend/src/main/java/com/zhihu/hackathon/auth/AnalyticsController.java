package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {
  private static final String COOKIE = "KST_VISITOR";
  private static final Set<String> PAGES = Set.of("home", "login", "history", "questions", "result");
  private final VisitorAnalytics analytics;
  private final LoginClientAddress addresses;
  private final SessionAuthentication sessions;
  private final AuthUserStore users;
  private final boolean secure;
  private final AnalyticsGeo geo;
  private final AnalyticsRateLimit limit = new AnalyticsRateLimit();
  public AnalyticsController(VisitorAnalytics analytics, LoginClientAddress addresses,
      SessionAuthentication sessions, AuthUserStore users, AnalyticsGeo geo,
      @Value("${server.servlet.session.cookie.secure:false}") boolean secure) {
    this.analytics=analytics; this.addresses=addresses; this.sessions=sessions; this.users=users; this.secure=secure; this.geo=geo;
  }
  public record Pageview(String eventId, String page) {}

  @PostMapping("/pageviews")
  public ResponseEntity<Void> visit(@RequestBody Pageview event, HttpServletRequest request) {
    // A custom header + default-denied CORS prevents cross-site form/beacon injection.
    String site=request.getHeader("Sec-Fetch-Site");
    if (!"1".equals(request.getHeader("X-Ksteps-Analytics"))
        || (site != null && !"same-origin".equals(site))) {
      throw new AuthException(403,"ANALYTICS_ORIGIN_REJECTED","统计请求来源不正确。");
    }
    if (event == null || !uuid(event.eventId()) || !PAGES.contains(event.page() == null ? "" : event.page())) {
      throw new AuthException(400,"INVALID_PAGEVIEW","统计请求格式不正确。");
    }
    var session=request.getSession(false);
    Object id=session == null ? null : session.getAttribute(SessionAuthentication.USER_ID);
    if (id instanceof Long userId && users.isAdmin(userId)) return ResponseEntity.noContent().build();
    String ip=addresses.resolve(request);
    Instant now=Instant.now();
    if (!limit.allow(ip, now.toEpochMilli())) {
      return ResponseEntity.status(429).header("Retry-After","60").header("Cache-Control","no-store").build();
    }
    String visitor=null;
    if (request.getCookies()!=null) for (var cookie:request.getCookies()) {
      if (COOKIE.equals(cookie.getName()) && uuid(cookie.getValue())) { visitor=cookie.getValue(); break; }
    }
    boolean fresh=visitor == null;
    if (fresh) visitor=UUID.randomUUID().toString();
    analytics.record(visitor, ip, event.eventId(), now,event.page(),AnalyticsDevice.parse(request.getHeader("User-Agent")),geo.lookup(ip));
    var response=ResponseEntity.noContent().header("Cache-Control","no-store");
    if (fresh) response.header("Set-Cookie", ResponseCookie.from(COOKIE, visitor).httpOnly(true)
        .secure(secure).sameSite("Lax").path("/").maxAge(Duration.ofDays(365)).build().toString());
    return response.build();
  }

  @GetMapping("/summary")
  public ResponseEntity<VisitorAnalytics.Report> summary(HttpServletRequest request,
      @RequestParam(required=false) String start,@RequestParam(required=false) String end) {
    long id=sessions.currentUserId(request);
    if (!users.isAdmin(id)) throw new AuthException(403,"ADMIN_REQUIRED","仅管理员可查看访问统计。");
    return ResponseEntity.ok().header("Cache-Control","no-store").body(analytics.report(Instant.now(),start,end));
  }
  @GetMapping("/visits")
  public ResponseEntity<VisitorAnalytics.Visits> visits(HttpServletRequest request,
      @RequestParam(required=false) String start,@RequestParam(required=false) String end,@RequestParam(defaultValue="1") int page) {
    long id=sessions.currentUserId(request);
    if(!users.isAdmin(id)) throw new AuthException(403,"ADMIN_REQUIRED","仅管理员可查看访问记录。");
    return ResponseEntity.ok().header("Cache-Control","no-store").body(analytics.visits(Instant.now(),start,end,page));
  }
  private static boolean uuid(String value) {
    return value != null && value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
  }
}
