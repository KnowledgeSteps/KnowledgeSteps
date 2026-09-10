package com.zhihu.hackathon.session;

import com.zhihu.hackathon.auth.SessionAuthentication;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import java.nio.file.Files;
import java.util.List;
import java.time.Duration;
import static com.zhihu.hackathon.session.Generation.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={"spring.config.import=", "spring.profiles.active=integration"})
@AutoConfigureMockMvc
class SessionIntegrationTest {
  static final String DB=temporaryDb();
  @DynamicPropertySource static void db(DynamicPropertyRegistry r) { r.add("spring.datasource.url",()->DB); }
  static String temporaryDb() { try { return "jdbc:sqlite:"+Files.createTempFile("sessions-", ".db"); } catch(Exception e) { throw new IllegalStateException(e); } }
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired ObjectMapper json;
  @Autowired SessionStore store;
  @MockitoBean SiliconFlowGenerationClient model;
  @MockitoBean ResourceSearch search;
  MockHttpSession session;
  String csrf;
  @BeforeEach void user() throws Exception {
    seedUser(1, "test-one");
    seedUser(2, "test-two");
    session=new MockHttpSession();session.setAttribute(SessionAuthentication.USER_ID,1L);
    var me=mvc.perform(get("/api/v1/auth/me").session(session)).andExpect(status().isOk()).andReturn();
    csrf=json.readTree(me.getResponse().getContentAsString()).path("csrfToken").asText();
    when(model.generateGraph(anyString())).thenReturn(new Graph(List.of(new Node("a","矩阵运算","理解计算")),List.of(new Edge("a","target"))));
    when(search.search(anyString())).thenReturn(List.of(new Resource("资料","https://www.zhihu.com/question/1",null,null,null)));
    when(model.generateQuestions(anyList())).thenAnswer(invocation -> {
      List<SavedNode> ns=invocation.getArgument(0);
      return ns.stream().map(n -> new Question(n.id(),"你了解"+n.name()+"吗？","用途")).toList();
    });
  }
  @Test void createsReadySessionWithSavedGraphResourcesAndQuestions() throws Exception {
    long id=create();waitFor(id,"READY");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_nodes WHERE session_id=?",Integer.class,id)).isEqualTo(2);
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=?",Integer.class,id)).isEqualTo(1);
    var snapshot=store.findOwned(1,id);
    assertThat(snapshot.progress()).isEqualTo(new SessionStore.Progress(1,1));
    var order=inOrder(model,search);order.verify(model).generateGraph("Transformer");order.verify(search).search("矩阵运算");order.verify(model).generateQuestions(anyList());
  }
  @Test void isolatesUsersAndRejectsClientUserId() throws Exception {
    long id=create();waitFor(id,"READY");
    var other=new MockHttpSession();other.setAttribute(SessionAuthentication.USER_ID,2L);
    mvc.perform(get("/api/v1/learning-sessions/"+id).session(other).param("userId","1"))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    assertThat(jdbc.queryForObject("SELECT user_id FROM learning_sessions WHERE id=?",Long.class,id)).isEqualTo(1);
  }
  @Test void returnsQuestionsInOrderWithFixedOptionsAndSavedAnswer() throws Exception {
    long id=create();waitFor(id,"READY");
    long questionId=jdbc.queryForObject("SELECT q.id FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=?",Long.class,id);
    jdbc.update("INSERT INTO assessment_answers(question_id,answer_value,answered_at) VALUES (?, 'VERY_FAMILIAR', 'now')",questionId);

    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions").session(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.questions[0].questionId").value(Long.toString(questionId)))
        .andExpect(jsonPath("$.questions[0].nodeName").value("矩阵运算"))
        .andExpect(jsonPath("$.questions[0].answer").value("VERY_FAMILIAR"))
        .andExpect(jsonPath("$.questions[0].options[0].value").value("VERY_FAMILIAR"))
        .andExpect(jsonPath("$.questions[0].options[3].value").value("DONT_KNOW"));
  }
  @Test void returnsMultipleQuestionsBySortOrderAndKeepsUnansweredValueNull() throws Exception {
    when(model.generateGraph(anyString())).thenReturn(new Graph(
        List.of(new Node("a","线性代数","理解向量"),new Node("b","概率论","理解概率")),
        List.of(new Edge("a","target"),new Edge("b","target"))));
    long id=create();waitFor(id,"READY");
    var questionIds=jdbc.query("SELECT q.id FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=? ORDER BY q.id",
        (rs,row)->rs.getLong(1),id);
    jdbc.update("UPDATE assessment_questions SET sort_order=1 WHERE id=?",questionIds.get(0));
    jdbc.update("UPDATE assessment_questions SET sort_order=0 WHERE id=?",questionIds.get(1));

    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions").session(session))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.questions.length()").value(2))
        .andExpect(jsonPath("$.questions[0].questionId").value(Long.toString(questionIds.get(1))))
        .andExpect(jsonPath("$.questions[1].questionId").value(Long.toString(questionIds.get(0))))
        .andExpect(jsonPath("$.questions[0].answer").value(org.hamcrest.Matchers.nullValue()));
  }
  @Test void rejectsQuestionsForAnotherUserOrSessionThatIsNotReady() throws Exception {
    long id=create();waitFor(id,"READY");
    var other=new MockHttpSession();other.setAttribute(SessionAuthentication.USER_ID,2L);
    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions").session(other))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));

    jdbc.update("INSERT INTO learning_sessions(user_id,target_name,status,created_at,updated_at) VALUES (1,'等待中','GENERATING_GRAPH','now','now')");
    long pending=jdbc.queryForObject("SELECT last_insert_rowid()",Long.class);
    mvc.perform(get("/api/v1/learning-sessions/"+pending+"/questions").session(session))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("SESSION_NOT_READY"));
  }
  @Test void allowsCompletedSessionsAndRejectsInvalidIdsOrUnauthenticatedRequests() throws Exception {
    long id=create();waitFor(id,"READY");
    jdbc.update("UPDATE learning_sessions SET status='COMPLETED' WHERE id=?",id);
    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions").session(session))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/learning-sessions/0/questions").session(session))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    mvc.perform(get("/api/v1/learning-sessions/99999999999999999999/questions").session(session))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions"))
        .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error.code").value("UNAUTHORIZED"));
  }
  @Test void returnsAnEmptyQuestionListWhenTargetHasNoPrerequisites() throws Exception {
    when(model.generateGraph(anyString())).thenReturn(new Graph(List.of(),List.of()));
    long id=create();waitFor(id,"READY");
    mvc.perform(get("/api/v1/learning-sessions/"+id+"/questions").session(session))
        .andExpect(status().isOk()).andExpect(jsonPath("$.questions.length()").value(0));
  }
  @Test void savesAnswersUpdatesMasteryAndDoesNotDoubleCountRepeatedSubmissions() throws Exception {
    long id=create();waitFor(id,"READY");
    long questionId=questionId(id);
    String path="/api/v1/learning-sessions/"+id+"/answers/"+questionId;

    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"answer\":\"VERY_FAMILIAR\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.questionId").value(Long.toString(questionId)))
        .andExpect(jsonPath("$.masteryStatus").value("MASTERED"))
        .andExpect(jsonPath("$.answeredCount").value(1))
        .andExpect(jsonPath("$.totalQuestions").value(1));
    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"answer\":\"HEARD_OF\"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.masteryStatus").value("TO_LEARN"))
        .andExpect(jsonPath("$.answeredCount").value(1));
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assessment_answers WHERE question_id=?",Integer.class,questionId)).isEqualTo(1);
    assertThat(jdbc.queryForObject("SELECT mastery_status FROM knowledge_nodes n JOIN assessment_questions q ON q.node_id=n.id WHERE q.id=?",String.class,questionId)).isEqualTo("TO_LEARN");
  }
  @Test void changesToCompletedSessionAnswersRestoreReadyAndClearCompletionTime() throws Exception {
    long id=create();waitFor(id,"READY");
    long questionId=questionId(id);
    jdbc.update("INSERT INTO assessment_answers(question_id,answer_value,answered_at) VALUES (?, 'VERY_FAMILIAR', 'now')",questionId);
    jdbc.update("UPDATE knowledge_nodes SET mastery_status='MASTERED' WHERE id=(SELECT node_id FROM assessment_questions WHERE id=?)",questionId);
    jdbc.update("UPDATE learning_sessions SET status='COMPLETED',completed_at='now' WHERE id=?",id);
    String path="/api/v1/learning-sessions/"+id+"/answers/"+questionId;

    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"answer\":\"DONT_KNOW\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.masteryStatus").value("TO_LEARN"));
    assertThat(jdbc.queryForObject("SELECT status FROM learning_sessions WHERE id=?",String.class,id)).isEqualTo("READY");
    assertThat(jdbc.queryForObject("SELECT completed_at FROM learning_sessions WHERE id=?",String.class,id)).isNull();
  }
  @Test void rejectsInvalidAnswersAndUnauthorizedOrUnavailableAnswerWrites() throws Exception {
    long id=create();waitFor(id,"READY");
    long questionId=questionId(id);
    String path="/api/v1/learning-sessions/"+id+"/answers/"+questionId;
    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"answer\":\"UNKNOWN\"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_ANSWER"));
    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_ANSWER"));
    mvc.perform(put(path).session(session).contentType("application/json").content("{\"answer\":\"VERY_FAMILIAR\"}"))
        .andExpect(status().isForbidden()).andExpect(jsonPath("$.error.code").value("CSRF_INVALID"));
    var other=new MockHttpSession();other.setAttribute(SessionAuthentication.USER_ID,2L);
    var otherMe=mvc.perform(get("/api/v1/auth/me").session(other)).andExpect(status().isOk()).andReturn();
    String otherCsrf=json.readTree(otherMe.getResponse().getContentAsString()).path("csrfToken").asText();
    mvc.perform(put(path).session(other).header("X-CSRF-Token",otherCsrf)
        .contentType("application/json").content("{\"answer\":\"VERY_FAMILIAR\"}"))
        .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("NOT_FOUND"));
    jdbc.update("UPDATE learning_sessions SET status='FAILED' WHERE id=?",id);
    mvc.perform(put(path).session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"answer\":\"VERY_FAMILIAR\"}"))
        .andExpect(status().isConflict()).andExpect(jsonPath("$.error.code").value("SESSION_NOT_READY"));
  }
  @Test void requiresLoginAndCsrf() throws Exception {
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/learning-sessions").contentType("application/json").content("{\"target\":\"X\"}"))
        .andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/learning-sessions").session(session).contentType("application/json").content("{\"target\":\"X\"}"))
        .andExpect(status().isForbidden());
    verifyNoInteractions(model,search);
  }
  @Test void invalidTargetsDoNotGenerate() throws Exception {
    mvc.perform(post("/api/v1/learning-sessions").session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"target\":\" \"}"))
        .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("INVALID_TARGET"));
    verifyNoInteractions(model,search);
  }
  @Test void searchFailureBecomesWarningAndStillReady() throws Exception {
    when(search.search(anyString())).thenThrow(new IllegalStateException("private response"));
    long id=create();waitFor(id,"READY");
    assertThat(store.findOwned(1,id).warnings()).hasSize(1);
    assertThat(store.findOwned(1,id).progress()).isEqualTo(new SessionStore.Progress(1,1));
  }
  @Test void invalidGraphFailsBeforeSavingAnyNodes() throws Exception {
    when(model.generateGraph(anyString())).thenReturn(new Graph(List.of(new Node("a","A","why")),List.of()));
    long id=create();waitFor(id,"FAILED");
    assertThat(store.findOwned(1,id).error().code()).isEqualTo("GRAPH_GENERATION_FAILED");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM knowledge_nodes WHERE session_id=?",Integer.class,id)).isZero();
    verifyNoInteractions(search);
  }
  @Test void missingQuestionsFailWithoutPartialQuestionRows() throws Exception {
    when(model.generateQuestions(anyList())).thenReturn(List.of());
    long id=create();waitFor(id,"FAILED");
    assertThat(store.findOwned(1,id).error().code()).isEqualTo("QUESTION_GENERATION_FAILED");
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=?",Integer.class,id)).isZero();
  }
  @Test void noPrerequisitesSkipsSearchAndQuestionModel() throws Exception {
    when(model.generateGraph(anyString())).thenReturn(new Graph(List.of(),List.of()));
    long id=create();waitFor(id,"READY");
    verify(model,never()).generateQuestions(anyList());verifyNoInteractions(search);
    assertThat(store.findOwned(1,id).progress()).isEqualTo(new SessionStore.Progress(0,0));
  }
  @Test void recoveryOnlyFailsUnfinishedSessions() throws Exception {
    long ready=create();waitFor(ready,"READY");
    long unfinished=store.create(1,"Interrupted");store.recoverInterrupted();
    assertThat(store.findOwned(1,unfinished).error().code()).isEqualTo("GENERATION_INTERRUPTED");
    assertThat(store.findOwned(1,ready).status()).isEqualTo("READY");
  }
  private long create() throws Exception {
    var result=mvc.perform(post("/api/v1/learning-sessions").session(session).header("X-CSRF-Token",csrf)
        .contentType("application/json").content("{\"target\":\"Transformer\",\"userId\":\"2\"}"))
        .andExpect(status().isAccepted()).andExpect(jsonPath("$.status").value("GENERATING_GRAPH")).andReturn();
    return Long.parseLong(json.readTree(result.getResponse().getContentAsString()).path("sessionId").asText());
  }
  private void seedUser(long id, String zhihuUserId) {
    Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id=?",Integer.class,id);
    if (count != null && count == 0) {
      jdbc.update("INSERT INTO users(id,zhihu_user_id,created_at) VALUES (?,?,?)",id,zhihuUserId,"now");
    }
  }
  private long questionId(long sessionId) {
    return jdbc.queryForObject("SELECT q.id FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=?",Long.class,sessionId);
  }
  private void waitFor(long id,String status) { await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertThat(store.findOwned(1,id).status()).isEqualTo(status)); }
}
