package com.zhihu.hackathon.tutorial;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.auth.AuthUserStore;
import com.zhihu.hackathon.auth.SessionAuthentication;
import java.nio.file.Files;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.config.import=", "spring.profiles.active=tutorial-test", "auth.admin.enabled=false", "auth.zhihu.enabled=false"})
@AutoConfigureMockMvc
class TutorialIntegrationTest {
  @DynamicPropertySource static void db(DynamicPropertyRegistry registry) throws Exception {
    String url="jdbc:sqlite:"+Files.createTempFile("tutorial-test-", ".db");registry.add("spring.datasource.url",()->url);
  }
  @Autowired MockMvc mvc;
  @Autowired AuthUserStore users;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  MockHttpSession user() {
    var session=new MockHttpSession();session.setAttribute(SessionAuthentication.USER_ID,users.zhihuUser("tutorial-"+UUID.randomUUID(),"学习者",null));return session;
  }
  String token(MockHttpSession session) throws Exception {
    return json.readTree(mvc.perform(get("/api/v1/auth/me").session(session)).andReturn().getResponse().getContentAsString()).path("csrfToken").asText();
  }
  @Test void isolatesProgressAndNeverCreatesBusinessRecords() throws Exception {
    var a=user();var b=user();String csrf=token(a);
    mvc.perform(get("/api/v1/tutorial")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/v1/tutorial").session(a)).andExpect(jsonPath("$.prompted").value(false));
    mvc.perform(patch("/api/v1/tutorial").session(a).contentType("application/json").content("{\"action\":\"seen\",\"revision\":0}")).andExpect(status().isForbidden());
    mvc.perform(patch("/api/v1/tutorial").session(a).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"action\":\"seen\",\"revision\":0}")).andExpect(status().isOk()).andExpect(jsonPath("$.prompted").value(true));
    for(int revision=1;revision<=5;revision++) {
      mvc.perform(patch("/api/v1/tutorial").session(a).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"action\":\"advance\",\"revision\":"+revision+"}"))
          .andExpect(status().isOk()).andExpect(jsonPath("$.step").value(revision));
    }
    mvc.perform(get("/api/v1/tutorial").session(b)).andExpect(jsonPath("$.step").value(0)).andExpect(jsonPath("$.prompted").value(false));
    // Duplicate/stale delivery cannot advance or reset a newer tutorial state.
    mvc.perform(patch("/api/v1/tutorial").session(a).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"action\":\"reset\",\"revision\":1}"))
        .andExpect(status().isConflict());
    mvc.perform(get("/api/v1/tutorial").session(a)).andExpect(jsonPath("$.step").value(5));
    mvc.perform(patch("/api/v1/tutorial").session(a).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"action\":\"reset\",\"revision\":6}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.step").value(0)).andExpect(jsonPath("$.prompted").value(true));
    for(String table:java.util.List.of("learning_sessions","knowledge_card_favorites","reading_explanations"))
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM "+table,Integer.class)).isZero();
  }
  @Test void rejectsInvalidActions() throws Exception {
    var a=user();String csrf=token(a);
    for(String body:java.util.List.of("{}","{\"action\":\"delete\",\"revision\":0}","{\"action\":\"advance\",\"revision\":-1}"))
      mvc.perform(patch("/api/v1/tutorial").session(a).header("X-CSRF-Token",csrf).contentType("application/json").content(body)).andExpect(status().isBadRequest());
  }
}
