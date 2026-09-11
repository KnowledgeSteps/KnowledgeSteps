package com.zhihu.hackathon.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.session.Generation;
import com.zhihu.hackathon.session.SiliconFlowGenerationClient;
import java.nio.file.Files;
import java.util.List;
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
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "spring.config.import=", "spring.profiles.active=admin-local",
    "auth.admin.username=admin", "auth.admin.password-hash=" + AdminLoginServiceTest.HASH
})
@AutoConfigureMockMvc
class AdminLoginIntegrationTest {
  @DynamicPropertySource
  static void db(DynamicPropertyRegistry registry) throws Exception {
    String url = "jdbc:sqlite:" + Files.createTempFile("admin-login-", ".db");
    registry.add("spring.datasource.url", () -> url);
  }

  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @MockitoBean SiliconFlowGenerationClient model;

  @Test void loginRotatesSessionAndCsrfAndLogoutRequiresLoginAgain() throws Exception {
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    var anonymous = mvc.perform(get("/api/v1/auth/csrf"))
        .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn();
    var oldSession = (MockHttpSession) anonymous.getRequest().getSession(false);
    String oldToken = json.readTree(anonymous.getResponse().getContentAsString()).path("csrfToken").asText();

    var response = mvc.perform(post("/api/v1/auth/admin/login").session(oldSession)
        .header("X-CSRF-Token", oldToken).contentType("application/json")
        .content("{\"username\":\"admin\",\"password\":\"test-admin-password\"}"))
        .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store")).andReturn();
    var login = json.readTree(response.getResponse().getContentAsString());
    assertThat(login.path("nickname").asText()).isEqualTo("管理员");
    jdbc.update("UPDATE users SET avatar_url=? WHERE id=?", "https://example.com/avatar.png", login.path("userId").asLong());
    var session = (MockHttpSession) response.getRequest().getSession(false);
    String token = login.path("csrfToken").asText();
    assertThat(oldSession.isInvalid()).isTrue();
    assertThat(token).isNotEqualTo(oldToken);
    assertThat(session.getId()).isNotEqualTo(oldSession.getId());
    mvc.perform(get("/api/v1/auth/me").session(session)).andExpect(status().isOk())
        .andExpect(jsonPath("$.userId").value(login.path("userId").asText()))
        .andExpect(jsonPath("$.nickname").value("管理员"))
        .andExpect(jsonPath("$.avatarUrl").value("https://example.com/avatar.png"));

    mvc.perform(post("/api/v1/learning-sessions").session(session).header("X-CSRF-Token", oldToken)
        .contentType("application/json").content("{\"target\":\"Transformer\"}"))
        .andExpect(status().isForbidden());
    when(model.generateGraph(anyString())).thenReturn(new Generation.Graph(List.of(), List.of()));
    var created = mvc.perform(post("/api/v1/learning-sessions").session(session).header("X-CSRF-Token", token)
        .contentType("application/json").content("{\"target\":\"Transformer\"}"))
        .andExpect(status().isAccepted()).andReturn();
    long id = json.readTree(created.getResponse().getContentAsString()).path("sessionId").asLong();
    assertThat(jdbc.queryForObject("SELECT user_id FROM learning_sessions WHERE id=?", Long.class, id))
        .isEqualTo(login.path("userId").asLong());

    mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-Token", token))
        .andExpect(status().isNoContent());
    assertThat(session.isInvalid()).isTrue();
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
  }

  @Test void loginRejectsMissingCsrfWrongPasswordAndMalformedBody() throws Exception {
    mvc.perform(post("/api/v1/auth/admin/login").contentType("application/json")
        .content("{\"username\":\"admin\",\"password\":\"test-admin-password\"}"))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
    var anonymous = mvc.perform(get("/api/v1/auth/csrf")).andReturn();
    var session = (MockHttpSession) anonymous.getRequest().getSession(false);
    String token = json.readTree(anonymous.getResponse().getContentAsString()).path("csrfToken").asText();
    mvc.perform(post("/api/v1/auth/admin/login").session(session).header("X-CSRF-Token", token)
        .contentType("application/json").content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
    mvc.perform(get("/api/v1/auth/me").session(session)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/auth/admin/login").session(session).header("X-CSRF-Token", token)
        .contentType("application/json").content("{"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_LOGIN_REQUEST"));
  }

  @Test void adminIdentityIsStableAndCannotReadAnotherUsersTask() throws Exception {
    var users = new JdbcAuthUserStore(jdbc);
    long first = users.adminUser("admin");
    assertThat(users.adminUser("admin")).isEqualTo(first);
    long other = users.localUser("another-user");
    String now = java.time.Instant.now().toString();
    jdbc.update("INSERT INTO learning_sessions(user_id,target_name,status,created_at,updated_at) VALUES (?,?,'READY',?,?)",
        other, "Private target", now, now);
    long taskId = jdbc.queryForObject("SELECT id FROM learning_sessions WHERE user_id=?", Long.class, other);
    var session = new MockHttpSession();
    session.setAttribute(SessionAuthentication.USER_ID, first);
    mvc.perform(get("/api/v1/learning-sessions/" + taskId).session(session)).andExpect(status().isNotFound());
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE zhihu_user_id='admin:admin'", Integer.class))
        .isEqualTo(1);
  }
}
