package com.zhihu.hackathon.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.net.URI;
import java.nio.file.Files;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "spring.profiles.active=oauth-test",
    "auth.admin.enabled=false", "auth.zhihu.enabled=true"})
@AutoConfigureMockMvc
class ZhihuOAuthIntegrationTest {
  @DynamicPropertySource
  static void db(DynamicPropertyRegistry registry) throws Exception {
    String url = "jdbc:sqlite:" + Files.createTempFile("zhihu-oauth-", ".db");
    registry.add("spring.datasource.url", () -> url);
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @Autowired AuthUserStore users;
  @MockitoBean ZhihuOAuthClient client;

  @BeforeEach void setup() {
    when(client.enabled()).thenReturn(true);
    when(client.authorizationUri(anyString())).thenAnswer(call ->
        URI.create("https://openapi.zhihu.com/authorize?state=" + call.getArgument(0)));
  }

  @Test void verifiedIdentityEstablishesFreshSessionWithCsrfAndCannotReplayCallback() throws Exception {
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    var anonymous = mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk()).andReturn();
    var old = (MockHttpSession) anonymous.getRequest().getSession(false);
    String oldCsrf = json.readTree(anonymous.getResponse().getContentAsString()).path("csrfToken").asText();
    when(client.authenticate("verified-code")).thenReturn(new ZhihuOAuthClient.Identity("101", "知乎学习者", "https://picx.zhimg.com/test.jpg"));
    var start = mvc.perform(get("/api/v1/auth/zhihu/start").session(old).param("returnTo", "/history"))
        .andExpect(status().isSeeOther()).andReturn();
    String state = stateFrom(start.getResponse().getRedirectedUrl());
    var result = mvc.perform(get("/api/v1/auth/zhihu/callback").session(old)
        .param("state", state).param("authorization_code", "verified-code"))
        .andExpect(status().isSeeOther()).andExpect(redirectedUrl("/history")).andReturn();
    var session = (MockHttpSession) result.getRequest().getSession(false);
    assertThat(old.isInvalid()).isTrue();
    assertThat(session.getId()).isNotEqualTo(old.getId());
    var me = mvc.perform(get("/api/v1/auth/me").session(session)).andExpect(status().isOk())
        .andExpect(jsonPath("$.nickname").value("知乎学习者"))
        .andExpect(jsonPath("$.avatarUrl").value("https://picx.zhimg.com/test.jpg"))
        .andExpect(header().string("Cache-Control", "no-store")).andReturn();
    String csrf = json.readTree(me.getResponse().getContentAsString()).path("csrfToken").asText();
    assertThat(csrf).isNotBlank().isNotEqualTo(oldCsrf);
    mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-Token", oldCsrf))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(session)
        .param("state", state).param("authorization_code", "verified-code"))
        .andExpect(status().isSeeOther()).andExpect(header().string("Location", "/login?oauthError=OAUTH_STATE_INVALID&returnTo=/"));
    // A browser replaying the invalidated session cookie has no authenticated server session.
    mvc.perform(get("/api/v1/auth/zhihu/callback").cookie(new Cookie("JSESSIONID", old.getId()))
        .param("state", state).param("authorization_code", "verified-code"))
        .andExpect(status().isSeeOther()).andExpect(header().string("Location", "/login?oauthError=OAUTH_STATE_INVALID&returnTo=/"));
    mvc.perform(get("/api/v1/auth/me").cookie(new Cookie("JSESSIONID", old.getId())))
        .andExpect(status().isUnauthorized());
    verify(client, times(1)).authenticate("verified-code");
    mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-Token", csrf))
        .andExpect(status().isNoContent());
    assertThat(session.isInvalid()).isTrue();
  }

  @Test void identityUsesVerifiedUidAndRemainsStableAcrossProfileChangesWithoutAdminCollision() throws Exception {
    long adminId = users.adminUser("202");
    long testId = users.localUser("202");
    when(client.authenticate("first")).thenReturn(new ZhihuOAuthClient.Identity("202", "管理员", ""));
    when(client.authenticate("again")).thenReturn(new ZhihuOAuthClient.Identity("202", "改名后的用户", "https://picx.zhimg.com/new.jpg"));
    var first = login("first");
    long userId = (Long) first.getAttribute(SessionAuthentication.USER_ID);
    var second = login("again");
    assertThat(second.getAttribute(SessionAuthentication.USER_ID)).isEqualTo(userId);
    assertThat(userId).isNotEqualTo(adminId).isNotEqualTo(testId);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE zhihu_user_id='zhihu:202'", Integer.class)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, userId)).isEqualTo("改名后的用户");
    assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=?", String.class, adminId)).isEqualTo("管理员");
    mvc.perform(get("/api/v1/auth/me").session(first)).andExpect(status().isOk())
        .andExpect(jsonPath("$.nickname").value("改名后的用户"));
  }

  @Test void separateZhihuUsersCannotReadOrDeleteEachOthersHistory() throws Exception {
    when(client.authenticate("alice")).thenReturn(new ZhihuOAuthClient.Identity("303", "相同昵称", ""));
    when(client.authenticate("bob")).thenReturn(new ZhihuOAuthClient.Identity("404", "相同昵称", ""));
    var alice = login("alice");
    var bob = login("bob");
    long aliceId = (Long) alice.getAttribute(SessionAuthentication.USER_ID);
    long bobId = (Long) bob.getAttribute(SessionAuthentication.USER_ID);
    assertThat(aliceId).isNotEqualTo(bobId);
    String now = Instant.now().toString();
    jdbc.update("INSERT INTO learning_sessions(user_id,target_name,status,created_at,updated_at) VALUES (?,?,'READY',?,?)",
        aliceId, "Alice private target", now, now);
    long task = jdbc.queryForObject("SELECT id FROM learning_sessions WHERE user_id=?", Long.class, aliceId);
    mvc.perform(get("/api/v1/learning-sessions/" + task).session(alice)).andExpect(status().isOk());
    mvc.perform(get("/api/v1/learning-sessions/" + task).session(bob)).andExpect(status().isNotFound());
    var me = mvc.perform(get("/api/v1/auth/me").session(bob)).andReturn();
    String csrf = json.readTree(me.getResponse().getContentAsString()).path("csrfToken").asText();
    mvc.perform(delete("/api/v1/learning-sessions/" + task).session(bob).header("X-CSRF-Token", csrf))
        .andExpect(status().isNotFound());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions WHERE id=?", Integer.class, task)).isEqualTo(1);
    mvc.perform(get("/api/v1/learning-sessions").session(bob)).andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
  }

  private MockHttpSession login(String code) throws Exception {
    var start = mvc.perform(get("/api/v1/auth/zhihu/start")).andExpect(status().isSeeOther()).andReturn();
    String state = stateFrom(start.getResponse().getRedirectedUrl());
    var pending = (MockHttpSession) start.getRequest().getSession(false);
    var callback = mvc.perform(get("/api/v1/auth/zhihu/callback").session(pending)
        .param("state", state).param("authorization_code", code))
        .andExpect(status().isSeeOther()).andExpect(redirectedUrl("/")).andReturn();
    return (MockHttpSession) callback.getRequest().getSession(false);
  }
  private String stateFrom(String url) {
    return UriComponentsBuilder.fromUriString(url).build().getQueryParams().getFirst("state");
  }
}
