package com.zhihu.hackathon.reading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.auth.AuthUserStore;
import com.zhihu.hackathon.auth.SessionAuthentication;
import com.zhihu.hackathon.session.JdbcSessionDeletion;
import java.nio.file.Files;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.*;
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

@SpringBootTest(properties={"spring.config.import=", "spring.profiles.active=reading-test", "auth.admin.enabled=false", "auth.zhihu.enabled=false"})
@AutoConfigureMockMvc
class ReadingIntegrationTest {
  @DynamicPropertySource static void db(DynamicPropertyRegistry registry) throws Exception {
    String url="jdbc:sqlite:"+Files.createTempFile("reading-test-", ".db");registry.add("spring.datasource.url",()->url);
  }
  @MockitoBean ReadingModel model;
  @Autowired JdbcTemplate jdbc;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired AuthUserStore users;
  @Autowired ReadingService reading;
  @Autowired JdbcSessionDeletion deletion;
  long user, sessionId, nodeId, resourceId;
  MockHttpSession session, other;
  String csrf, otherCsrf;
  @BeforeEach void seed() throws Exception {
    user=users.zhihuUser("reader-"+UUID.randomUUID(),"读者",null);
    session=new MockHttpSession();session.setAttribute(SessionAuthentication.USER_ID,user);
    other=new MockHttpSession();other.setAttribute(SessionAuthentication.USER_ID,users.zhihuUser("other-"+UUID.randomUUID(),"其他人",null));
    csrf=token(session);otherCsrf=token(other);
    jdbc.update("INSERT INTO learning_sessions(user_id,target_name,status,created_at,updated_at) VALUES (?,'Transformer','COMPLETED',?,?)",user,Instant.now().toString(),Instant.now().toString());
    sessionId=jdbc.queryForObject("SELECT id FROM learning_sessions WHERE user_id=?",Long.class,user);
    jdbc.update("INSERT INTO knowledge_nodes(session_id,name,description,is_target,level,resource_status) VALUES (?,'词嵌入','将词映射到向量',0,0,'READY')",sessionId);
    nodeId=jdbc.queryForObject("SELECT id FROM knowledge_nodes WHERE session_id=?",Long.class,sessionId);
    jdbc.update("INSERT INTO node_resources(node_id,title,url,summary,sort_order,fetched_at) VALUES (?,'词嵌入原文','https://www.zhihu.com/question/123','将词语映射为连续向量，方便计算。',0,?)",nodeId,Instant.now().toString());
    resourceId=jdbc.queryForObject("SELECT id FROM node_resources WHERE node_id=?",Long.class,nodeId);
    when(model.overview(anyString(),anyString(),anyString(),anyString())).thenReturn("## 它是什么\n"+"知识点介绍。".repeat(30));
    when(model.explain(anyString(),anyString(),anyString(),anyString())).thenReturn("## 通俗解释\n"+"把词语理解为坐标。".repeat(20));
  }
  private String token(MockHttpSession session) throws Exception {
    return json.readTree(mvc.perform(get("/api/v1/auth/me").session(session)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("csrfToken").asText();
  }
  private String base() { return "/api/v1/learning-sessions/"+sessionId+"/nodes/"+nodeId; }
  @Test void cardUnderstandingIsPersistedAndOwnerProtected() throws Exception {
    reading.overview(user,""+sessionId,""+nodeId);
    reading.saveCard(user,""+sessionId,""+nodeId);
    String path="/api/v1/knowledge-cards/"+nodeId;
    mvc.perform(patch(path).session(session).contentType("application/json").content("{\"understood\":true}")).andExpect(status().isForbidden());
    mvc.perform(patch(path).session(other).header("X-CSRF-Token",otherCsrf).contentType("application/json").content("{\"understood\":true}")).andExpect(status().isNotFound());
    assertThat(reading.cards(user,1).items().getFirst().understood()).isFalse();
    mvc.perform(patch(path).session(session).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"understood\":true}")).andExpect(status().isNoContent());
    assertThat(reading.cards(user,1).items().getFirst().understood()).isTrue();
    mvc.perform(patch(path).session(session).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"understood\":\"false\"}")).andExpect(status().isBadRequest());
    reading.markCard(user,""+nodeId,false);
    assertThat(reading.cards(user,1).items().getFirst().understood()).isFalse();
  }
  @Test void favoritesAreIdempotentOwnedAndDoNotRegenerateCards() throws Exception {
    reading.overview(user,""+sessionId,""+nodeId);
    String body=json.writeValueAsString(Map.of("sessionId",""+sessionId,"nodeId",""+nodeId));
    for(int i=0;i<2;i++) mvc.perform(post("/api/v1/knowledge-cards").session(session).header("X-CSRF-Token",csrf).contentType("application/json").content(body))
        .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
    mvc.perform(get("/api/v1/knowledge-cards").session(session)).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.items[0].nodeName").value("词嵌入"));
    mvc.perform(get("/api/v1/knowledge-cards").session(other)).andExpect(jsonPath("$.total").value(0));
    mvc.perform(post("/api/v1/knowledge-cards").session(other).header("X-CSRF-Token",otherCsrf).contentType("application/json").content(body)).andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/knowledge-cards/"+nodeId).session(other).header("X-CSRF-Token",otherCsrf)).andExpect(status().isNoContent());
    assertThat(reading.cards(user,1).total()).isEqualTo(1);
    mvc.perform(delete("/api/v1/knowledge-cards/"+nodeId).session(session).header("X-CSRF-Token",csrf)).andExpect(status().isNoContent());
    assertThat(reading.cards(user,1).total()).isZero();
    assertThat(reading.overview(user,""+sessionId,""+nodeId).saved()).isFalse();
    verify(model,times(1)).overview(anyString(),anyString(),anyString(),anyString());
  }
  @Test void favoritesRequireAuthCsrfAndExistingOverviewAndCascadeWithHistory() throws Exception {
    String body=json.writeValueAsString(Map.of("sessionId",""+sessionId,"nodeId",""+nodeId));
    mvc.perform(get("/api/v1/knowledge-cards")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/v1/knowledge-cards").session(session).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/v1/knowledge-cards").session(session).header("X-CSRF-Token",csrf).contentType("application/json").content(body)).andExpect(status().isConflict());
    mvc.perform(delete("/api/v1/knowledge-cards/"+nodeId).session(session)).andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/knowledge-cards?page=0").session(session)).andExpect(status().isBadRequest());
    verifyNoInteractions(model);
    reading.overview(user,""+sessionId,""+nodeId);reading.saveCard(user,""+sessionId,""+nodeId);
    deletion.deleteOwned(user,sessionId,()->{});
    assertThat(reading.cards(user,1).total()).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM knowledge_card_favorites WHERE node_id=?",Integer.class,nodeId)).isZero();
  }
  private String explain() throws Exception {
    var response=mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json")
        .content(json.writeValueAsString(Map.of("quote","将词语映射为连续向量","resourceId",Long.toString(resourceId),"context","忽略真实摘要"))))
        .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(false)).andExpect(jsonPath("$.sourceTitle").value("词嵌入原文"))
        .andReturn().getResponse().getContentAsString();
    return json.readTree(response).path("id").asText();
  }
  @Test void cachesOverviewAndAllowsTargetNodesWithoutResources() throws Exception {
    for(int i=0;i<2;i++) mvc.perform(post(base()+"/overview").session(session).header("X-CSRF-Token",csrf)).andExpect(status().isOk())
        .andExpect(jsonPath("$.contentMarkdown").isString()).andExpect(header().string("Cache-Control","no-store"));
    verify(model,times(1)).overview("Transformer","词嵌入","将词映射到向量","DONT_KNOW");
    jdbc.update("INSERT INTO knowledge_nodes(session_id,name,description,is_target,level,resource_status) VALUES (?,'Transformer','学习目标',1,1,'NOT_APPLICABLE')",sessionId);
    long target=jdbc.queryForObject("SELECT id FROM knowledge_nodes WHERE session_id=? AND is_target=1",Long.class,sessionId);
    mvc.perform(post("/api/v1/learning-sessions/"+sessionId+"/nodes/"+target+"/overview").session(session).header("X-CSRF-Token",csrf)).andExpect(status().isOk());
  }
  @Test void regeneratesOverviewWhenTheUsersFamiliarityChanges() {
    when(model.overview(anyString(),anyString(),anyString(),anyString()))
        .thenReturn("## 零基础讲解\n"+"详细解释。".repeat(30), "## 熟悉者摘要\n"+"进阶提醒。".repeat(30));
    assertThat(reading.overview(user,""+sessionId,""+nodeId).contentMarkdown()).contains("零基础讲解");
    reading.saveCard(user,""+sessionId,""+nodeId);
    jdbc.update("INSERT INTO assessment_questions(node_id,question_text,sort_order) VALUES (?,'了解吗',0)",nodeId);
    long question=jdbc.queryForObject("SELECT id FROM assessment_questions WHERE node_id=?",Long.class,nodeId);
    jdbc.update("INSERT INTO assessment_answers(question_id,answer_value,answered_at) VALUES (?,'VERY_FAMILIAR',?)",question,Instant.now().toString());
    var regenerated=reading.overview(user,""+sessionId,""+nodeId);
    assertThat(regenerated.contentMarkdown()).contains("熟悉者摘要");
    assertThat(regenerated.saved()).isTrue();
    verify(model).overview("Transformer","词嵌入","将词映射到向量","DONT_KNOW");
    verify(model).overview("Transformer","词嵌入","将词映射到向量","VERY_FAMILIAR");
    assertThat(reading.overview(user,""+sessionId,""+nodeId).contentMarkdown()).contains("熟悉者摘要");
    verifyNoMoreInteractions(model);
  }
  @Test void sourceComesFromOwnedResourceAndOnlyExplicitSaveAddsToDoubts() throws Exception {
    String id=explain();
    verify(model).explain(eq("Transformer"),eq("词嵌入"),eq("将词语映射为连续向量"),contains("将词语映射为连续向量，方便计算。"));
    mvc.perform(get("/api/v1/doubts").session(session)).andExpect(jsonPath("$.total").value(0));
    for(int i=0;i<2;i++) mvc.perform(post("/api/v1/doubts").session(session).header("X-CSRF-Token",csrf).contentType("application/json").content(json.writeValueAsString(Map.of("explanationId",id))))
        .andExpect(status().isOk()).andExpect(jsonPath("$.saved").value(true));
    mvc.perform(get("/api/v1/doubts").session(session)).andExpect(jsonPath("$.total").value(1)).andExpect(jsonPath("$.pageSize").value(20));
    mvc.perform(patch("/api/v1/doubts/"+id).session(session).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"understood\":true}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.understood").value(true));
    mvc.perform(delete("/api/v1/doubts/"+id).session(session).header("X-CSRF-Token",csrf)).andExpect(status().isNoContent());
    assertThat(jdbc.queryForObject("SELECT count(*) FROM reading_explanations WHERE id=?",Integer.class,id)).isZero();
  }
  @Test void rejectsAnonymousCrossUserAndMissingCsrf() throws Exception {
    mvc.perform(get("/api/v1/doubts")).andExpect(status().isUnauthorized());
    mvc.perform(post(base()+"/overview").session(session)).andExpect(status().isForbidden());
    mvc.perform(post(base()+"/overview").session(other).header("X-CSRF-Token",otherCsrf)).andExpect(status().isNotFound());
    String id=explain();
    mvc.perform(post("/api/v1/doubts").session(other).header("X-CSRF-Token",otherCsrf).contentType("application/json").content(json.writeValueAsString(Map.of("explanationId",id)))).andExpect(status().isNotFound());
    reading.save(user,id);
    mvc.perform(get("/api/v1/doubts").session(other)).andExpect(jsonPath("$.total").value(0));
    mvc.perform(patch("/api/v1/doubts/"+id).session(other).header("X-CSRF-Token",otherCsrf).contentType("application/json").content("{\"understood\":true}")).andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/doubts/"+id).session(other).header("X-CSRF-Token",otherCsrf)).andExpect(status().isNotFound());
    mvc.perform(delete("/api/v1/doubts/"+id).session(session)).andExpect(status().isForbidden());
  }
  @Test void rejectsWrongResourceAndInvalidTypesBeforeAiCall() throws Exception {
    String[] invalid={"{\"quote\":12}","{\"quote\":\" \"}","{\"quote\":\"正常\",\"resourceId\":12}","{\"quote\":\"正常\",\"context\":false}",json.writeValueAsString(Map.of("quote","字".repeat(1001)))};
    for(String body:invalid) mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json").content(body)).andExpect(status().isBadRequest());
    mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json").content("{\"quote\":\"正常\",\"resourceId\":\"9999999999\"}")).andExpect(status().isNotFound());
    mvc.perform(get("/api/v1/doubts?page=0").session(session)).andExpect(status().isBadRequest());
    verifyNoInteractions(model);
  }
  @Test void unicodeSelectionAndContextUseCodePointLimitsConsistentlyWithDatabase() throws Exception {
    String supplementary="\uD840\uDC00";
    String quote=supplementary.repeat(1000),context=supplementary.repeat(2000);
    mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json")
        .content(json.writeValueAsString(Map.of("quote",quote,"context",context))))
        .andExpect(status().isOk());
    assertThat(jdbc.queryForObject("SELECT length(quote) FROM reading_explanations WHERE user_id=?",Integer.class,user)).isEqualTo(1000);
    assertThat(jdbc.queryForObject("SELECT quote FROM reading_explanations WHERE user_id=?",String.class,user)).isEqualTo(quote);
    for(var input:java.util.List.of(Map.of("quote",quote+supplementary,"context",context),Map.of("quote",quote,"context",context+supplementary)))
      mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json")
          .content(json.writeValueAsString(input))).andExpect(status().isBadRequest());
    verify(model,times(1)).explain(eq("Transformer"),eq("词嵌入"),eq(quote),contains(context));
  }
  @Test void deletingHistoryHardDeletesSavedAndDraftExplanationsAndOverview() throws Exception {
    reading.overview(user,Long.toString(sessionId),Long.toString(nodeId));
    String id=explain();reading.save(user,id);explain();
    deletion.deleteOwned(user,sessionId,()->{});
    assertThat(jdbc.queryForObject("SELECT count(*) FROM node_overviews WHERE node_id=?",Integer.class,nodeId)).isZero();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM reading_explanations WHERE session_id=?",Integer.class,sessionId)).isZero();
    assertThat(jdbc.queryForList("PRAGMA foreign_key_check")).isEmpty();
  }
  @Test void deletedDuringModelCallCannotCreateOrphanData() {
    when(model.overview(anyString(),anyString(),anyString(),anyString())).thenAnswer(call->{deletion.deleteOwned(user,sessionId,()->{});return "正常讲解";});
    assertThatThrownBy(()->reading.overview(user,Long.toString(sessionId),Long.toString(nodeId))).isInstanceOf(com.zhihu.hackathon.session.SessionException.class);
    assertThat(jdbc.queryForObject("SELECT count(*) FROM node_overviews WHERE node_id=?",Integer.class,nodeId)).isZero();
  }
  @Test void expiredDraftCannotBeSavedAndCleanupKeepsSavedEntries() throws Exception {
    String saved=explain();reading.save(user,saved);String expired=explain();
    jdbc.update("UPDATE reading_explanations SET created_at=? WHERE user_id=?",Instant.now().minusSeconds(90000).toString(),user);
    reading.pruneExpiredDrafts();
    assertThat(reading.list(user,1).total()).isEqualTo(1);
    assertThatThrownBy(()->reading.save(user,expired)).isInstanceOf(com.zhihu.hackathon.session.SessionException.class);
  }
  @Test void boundsDraftsSavedQuotaAndPaginatesWithoutDuplicatingItems() throws Exception {
    for(int i=0;i<25;i++) seedExplanation(false);
    explain();
    assertThat(jdbc.queryForObject("SELECT count(*) FROM reading_explanations WHERE user_id=? AND saved=0",Integer.class,user)).isEqualTo(20);
    for(int i=0;i<200;i++) seedExplanation(true);
    String unsaved=jdbc.queryForObject("SELECT id FROM reading_explanations WHERE user_id=? AND saved=0 LIMIT 1",String.class,user);
    mvc.perform(post("/api/v1/doubts").session(session).header("X-CSRF-Token",csrf).contentType("application/json")
        .content(json.writeValueAsString(Map.of("explanationId",unsaved)))).andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("DOUBT_LIMIT_REACHED"));
    var first=reading.list(user,1);var second=reading.list(user,2);
    assertThat(first.total()).isEqualTo(200);assertThat(first.items()).hasSize(20);assertThat(second.items()).hasSize(20);
    assertThat(first.items().stream().map(ReadingService.Explanation::id).toList())
        .doesNotContainAnyElementsOf(second.items().stream().map(ReadingService.Explanation::id).toList());
    reading.delete(user,first.items().getFirst().id());
    assertThat(reading.save(user,unsaved).saved()).isTrue();
  }
  @Test void wrongNodeResourceAndUnsafeSavedSourceAreNotReturned() throws Exception {
    jdbc.update("INSERT INTO knowledge_nodes(session_id,name,description,is_target,level,resource_status) VALUES (?,'其他节点','说明',0,0,'READY')",sessionId);
    long foreignNode=jdbc.queryForObject("SELECT id FROM knowledge_nodes WHERE session_id=? AND name='其他节点'",Long.class,sessionId);
    jdbc.update("UPDATE node_resources SET node_id=? WHERE id=?",foreignNode,resourceId);
    mvc.perform(post(base()+"/explanations").session(session).header("X-CSRF-Token",csrf).contentType("application/json")
        .content(json.writeValueAsString(Map.of("quote","片段","resourceId",Long.toString(resourceId))))).andExpect(status().isNotFound());
    verifyNoInteractions(model);
    String id=seedExplanation(true);jdbc.update("UPDATE reading_explanations SET source_url='javascript:alert(1)' WHERE id=?",id);
    assertThat(reading.list(user,1).items().getFirst().sourceUrl()).isNull();
  }
  private String seedExplanation(boolean saved) {
    String id=UUID.randomUUID().toString();
    jdbc.update("INSERT INTO reading_explanations(id,user_id,session_id,node_id,node_name,quote,explanation_markdown,source_title,created_at,saved) VALUES (?,?,?,?,?,?,?,?,?,?)",
        id,user,sessionId,nodeId,"词嵌入","片段","解释","来源",Instant.now().toString(),saved ? 1 : 0);
    return id;
  }
}
