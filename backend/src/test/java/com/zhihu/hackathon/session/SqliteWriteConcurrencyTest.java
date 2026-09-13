package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.auth.JdbcAuthUserStore;
import com.zhihu.hackathon.auth.SessionAuthentication;
import java.nio.file.Files;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"spring.config.import=", "auth.admin.enabled=false", "auth.zhihu.enabled=false"})
@AutoConfigureMockMvc
class SqliteWriteConcurrencyTest {
  @DynamicPropertySource static void database(DynamicPropertyRegistry registry) throws Exception {
    String url = "jdbc:sqlite:" + Files.createTempFile("write-contention-", ".db");
    registry.add("spring.datasource.url", () -> url);
  }
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @Autowired PlatformTransactionManager manager;
  @MockitoSpyBean JdbcAuthUserStore users;

  @Test void authenticatedDeleteWaitsForWriterInsteadOfUpgradingAnAuthenticationReadTransaction() throws Exception {
    long userId = users.adminUser("concurrency-test");
    jdbc.update("INSERT INTO learning_sessions(id,user_id,target_name,status,created_at,updated_at) VALUES (901,?,'test','READY','now','now')", userId);
    var session = new MockHttpSession();
    session.setAttribute(SessionAuthentication.USER_ID, userId);
    var response = mvc.perform(get("/api/v1/auth/csrf").session(session)).andReturn();
    String csrf = json.readTree(response.getResponse().getContentAsString()).path("csrfToken").asText();
    var authenticated = new CountDownLatch(1);
    var writeLocked = new CountDownLatch(1);
    var intercepted = new AtomicBoolean();
    try (var workers = Executors.newSingleThreadExecutor()) {
      var writer = workers.submit(() -> {
        try {
          if (!authenticated.await(5, TimeUnit.SECONDS)) throw new AssertionError("Authentication did not run");
          new TransactionTemplate(manager).executeWithoutResult(s -> {
            jdbc.update("UPDATE users SET nickname=nickname WHERE id=?", userId);
            writeLocked.countDown();
            try { new CountDownLatch(1).await(200, TimeUnit.MILLISECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
          });
        } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
      });
      doAnswer(call -> {
        Object allowed = call.callRealMethod();
        if (intercepted.compareAndSet(false, true)) {
          authenticated.countDown();
          assertThat(writeLocked.await(5, TimeUnit.SECONDS)).isTrue();
        }
        return allowed;
      }).when(users).isLoginUser(userId);
      try {
        mvc.perform(delete("/api/v1/learning-sessions/901").session(session).header("X-CSRF-Token", csrf))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions WHERE id=901", Integer.class)).isZero();
      } finally { writer.get(8, TimeUnit.SECONDS); }
    }
  }
}
