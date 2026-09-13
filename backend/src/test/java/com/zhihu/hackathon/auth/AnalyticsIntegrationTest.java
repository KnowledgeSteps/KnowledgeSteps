package com.zhihu.hackathon.auth;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.file.Files;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties={"spring.config.import=", "spring.profiles.active=analytics-test",
    "auth.admin.enabled=false", "auth.zhihu.enabled=false", "server.servlet.session.cookie.secure=true"})
@AutoConfigureMockMvc
class AnalyticsIntegrationTest {
  @DynamicPropertySource static void db(DynamicPropertyRegistry registry) throws Exception {
    String url="jdbc:sqlite:"+Files.createTempFile("analytics-test-", ".db");
    registry.add("spring.datasource.url", () -> url);
  }
  @Autowired VisitorAnalytics analytics;
  @Autowired JdbcTemplate jdbc;
  @Autowired MockMvc mvc;
  @Autowired AuthUserStore users;
  @Autowired AnalyticsGeo geo;
  @BeforeEach void reset() {
    jdbc.update("DELETE FROM analytics_unique");
    jdbc.update("DELETE FROM analytics_daily");
    jdbc.update("DELETE FROM analytics_receipts");
  }
  private Instant now() { return Instant.parse("2026-09-13T15:59:00Z"); }
  @Test void countsBrowserAndIpIndependentlyAndDeduplicatesRequests() {
    analytics.record("browser-a","203.0.113.1","a",now());
    analytics.record("browser-a","203.0.113.1","a",now());
    analytics.record("browser-a","203.0.113.2","b",now());
    analytics.record("browser-b","203.0.113.2","c",now());
    assertThat(analytics.report(now()).days().getFirst()).isEqualTo(new VisitorAnalytics.Day("2026-09-13",3,2,2));
    assertThat(jdbc.queryForList("SELECT digest FROM analytics_unique",String.class))
        .allMatch(s->s.matches("[0-9a-f]{64}"));
  }
  @Test void usesShanghaiMidnightAndExpiresThirtyDayData() {
    analytics.record("browser","203.0.113.1","a",now());
    var next=now().plusSeconds(120);
    analytics.record("browser","203.0.113.1","b",next);
    var days=analytics.report(next).days();
    assertThat(days.get(0)).isEqualTo(new VisitorAnalytics.Day("2026-09-14",1,1,1));
    assertThat(days.get(1)).isEqualTo(new VisitorAnalytics.Day("2026-09-13",1,1,1));
    assertThat(jdbc.queryForList("SELECT digest FROM analytics_unique WHERE kind='uv'",String.class)).doesNotHaveDuplicates();
    analytics.record("browser","203.0.113.1","c",next.plusSeconds(30*86400L));
    assertThat(jdbc.queryForObject("SELECT count(*) FROM analytics_daily",Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM analytics_unique",Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM analytics_receipts",Integer.class)).isEqualTo(1);
  }
  @Test void parallelDuplicateRequestsOnlyCountOnce() throws Exception {
    try (var pool=Executors.newFixedThreadPool(4)) {
      var work=new java.util.ArrayList<Future<?>>();
      for(int i=0;i<8;i++) work.add(pool.submit(()->analytics.record("browser","203.0.113.1","same",now())));
      for(var result:work) result.get(10,TimeUnit.SECONDS);
    }
    assertThat(analytics.report(now()).days().getFirst().pv()).isEqualTo(1);
  }
  @Test void summaryRequiresActualAdminIdentity() throws Exception {
    mvc.perform(get("/api/v1/analytics/summary")).andExpect(status().isUnauthorized());
    var normal=new MockHttpSession();
    normal.setAttribute(SessionAuthentication.USER_ID, users.zhihuUser("analytics-reader","管理员",null));
    mvc.perform(get("/api/v1/analytics/summary").session(normal)).andExpect(status().isForbidden());
    var admin=new MockHttpSession();
    admin.setAttribute(SessionAuthentication.USER_ID,users.adminUser("analytics-admin"));
    mvc.perform(get("/api/v1/analytics/summary").session(admin)).andExpect(status().isOk())
        .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.days.length()").value(30));
  }
  @Test void issuesPrivateCookieWithoutLoginAndRejectsCrossSiteOrArbitraryPaths() throws Exception {
    String body="{\"page\":\"login\",\"eventId\":\""+UUID.randomUUID()+"\"}";
    var response=mvc.perform(post("/api/v1/analytics/pageviews").contentType("application/json")
        .header("X-Ksteps-Analytics","1").header("Sec-Fetch-Site","same-origin").content(body))
        .andExpect(status().isNoContent()).andReturn();
    assertThat(response.getRequest().getSession(false)).isNull();
    String cookie=response.getResponse().getHeader("Set-Cookie");
    assertThat(cookie).contains("HttpOnly","Secure","SameSite=Lax","KST_VISITOR=");
    mvc.perform(post("/api/v1/analytics/pageviews").contentType("application/json")
        .header("X-Ksteps-Analytics","1").header("Sec-Fetch-Site","cross-site").content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/analytics/pageviews").contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/analytics/pageviews").contentType("application/json")
        .header("X-Ksteps-Analytics","1").content(body.replace("login","/secret?code=sensitive"))).andExpect(status().isBadRequest());
    assertThat(jdbc.queryForObject("SELECT sum(pv) FROM analytics_daily",Integer.class)).isEqualTo(1);
  }
  @Test void cookieSurvivesVisitsAndAdminVisitsAreExcluded() throws Exception {
    Cookie cookie=new Cookie("KST_VISITOR",UUID.randomUUID().toString());
    for(int i=0;i<2;i++) mvc.perform(post("/api/v1/analytics/pageviews").cookie(cookie)
        .header("X-Ksteps-Analytics","1").contentType("application/json")
        .content("{\"page\":\"home\",\"eventId\":\""+UUID.randomUUID()+"\"}"))
        .andExpect(status().isNoContent()).andExpect(header().doesNotExist("Set-Cookie"));
    var admin=new MockHttpSession();admin.setAttribute(SessionAuthentication.USER_ID,users.adminUser("analytics-admin"));
    mvc.perform(post("/api/v1/analytics/pageviews").session(admin).cookie(cookie)
        .header("X-Ksteps-Analytics","1").contentType("application/json")
        .content("{\"page\":\"home\",\"eventId\":\""+UUID.randomUUID()+"\"}"))
        .andExpect(status().isNoContent());
    assertThat(analytics.report(Instant.now()).days().getFirst()).isEqualTo(
        new VisitorAnalytics.Day(Instant.now().atZone(VisitorAnalytics.ZONE).toLocalDate().toString(),2,1,1));
  }
  @Test void admissionIsBoundedPerSourceAndGlobally() {
    var limit=new AnalyticsRateLimit();
    for(int i=0;i<60;i++) assertThat(limit.allow("ip",0)).isTrue();
    assertThat(limit.allow("ip",0)).isFalse();
    for(int i=0;i<240;i++) assertThat(limit.allow("ip"+i,0)).isTrue();
    assertThat(limit.allow("another",0)).isFalse();
    assertThat(limit.allow("ip",60_000)).isTrue();
  }
  @Test void collectsDimensionsWithoutPersistingRawIpOrAgent() {
    var agent="Mozilla/5.0 (Windows NT 10.0) Chrome/130.0.0.0 Safari/537.36 Edg/130.0";
    analytics.record("browser","203.0.113.9","d1",now(),"home",AnalyticsDevice.parse(agent),new AnalyticsGeo.Place("中国","上海市"));
    analytics.record("browser","203.0.113.9","d1",now(),"home",AnalyticsDevice.parse(agent),new AnalyticsGeo.Place("中国","上海市"));
    var report=analytics.report(now(),"2026-09-13","2026-09-13");
    assertThat(report.systems()).containsExactly(new VisitorAnalytics.Bucket("Windows",1));
    assertThat(report.browsers()).containsExactly(new VisitorAnalytics.Bucket("Edge",1));
    assertThat(report.regions()).containsExactly(new VisitorAnalytics.Bucket("上海市",1));
    assertThat(report.hours()).containsExactly(new VisitorAnalytics.Bucket("23",1));
    var visits=analytics.visits(now(),"2026-09-13","2026-09-13",1);
    assertThat(visits.total()).isEqualTo(1);
    assertThat(visits.items().getFirst().ip()).doesNotContain("203.0.113.9");
  }
  @Test void validatesRangeAndKeepsRecordsAdminOnly() throws Exception {
    assertThatThrownBy(()->analytics.report(now(),"2026-08-01","2026-09-13")).isInstanceOf(AuthException.class);
    assertThatThrownBy(()->analytics.report(now(),"2026-09-14","2026-09-14")).isInstanceOf(AuthException.class);
    assertThatThrownBy(()->analytics.report(now(),"invalid",null)).isInstanceOf(AuthException.class);
    mvc.perform(get("/api/v1/analytics/visits")).andExpect(status().isUnauthorized());
    var normal=new MockHttpSession();normal.setAttribute(SessionAuthentication.USER_ID,users.zhihuUser("visitor-reader","用户",null));
    mvc.perform(get("/api/v1/analytics/visits").session(normal)).andExpect(status().isForbidden());
  }
  @Test void offlineGeoAndBrowserClassificationWork() {
    assertThat(geo.lookup("unknown").country()).isEqualTo("未知");
    assertThat(geo.lookup("113.92.157.29").country()).isEqualTo("中国");
    assertThat(geo.lookup("113.92.157.29").region()).isEqualTo("广东省");
    assertThat(geo.lookup("240e:3b7:3272:d8d0:db09:c067:8d59:539e").country()).isNotEqualTo("未知");
    assertThat(AnalyticsDevice.parse("Mozilla iPhone CriOS/120 Safari")).isEqualTo(new AnalyticsDevice("iOS","Chrome"));
    assertThat(AnalyticsDevice.parse("Mozilla Android Firefox/120")).isEqualTo(new AnalyticsDevice("Android","Firefox"));
  }
  @Test void olderVisitsWithoutDimensionsRemainVisibleAsUncollected() {
    jdbc.update("INSERT INTO analytics_daily(day,pv) VALUES ('2026-09-13',2)");
    analytics.record("browser","203.0.113.9","new",now(),"home",new AnalyticsDevice("Windows","Chrome"),new AnalyticsGeo.Place("中国","广东省"));
    var report=analytics.report(now());
    assertThat(report.systems()).contains(new VisitorAnalytics.Bucket("未采集",2),new VisitorAnalytics.Bucket("Windows",1));
    assertThat(report.browsers().stream().mapToLong(VisitorAnalytics.Bucket::value).sum()).isEqualTo(3);
    assertThat(report.countries().stream().mapToLong(VisitorAnalytics.Bucket::value).sum()).isEqualTo(3);
  }
  @Test void missingOrCorruptGeoDataDoesNotPreventOtherAnalytics() throws Exception {
    var missing=new AnalyticsGeo(name->null);
    assertThat(missing.lookup("113.92.157.29")).isEqualTo(new AnalyticsGeo.Place("未知","未知"));
    missing.close();
    var corrupt=new AnalyticsGeo(name->new java.io.ByteArrayInputStream(new byte[]{1,2,3}));
    assertThat(corrupt.lookup("113.92.157.29")).isEqualTo(new AnalyticsGeo.Place("未知","未知"));
    corrupt.close();
  }
}
