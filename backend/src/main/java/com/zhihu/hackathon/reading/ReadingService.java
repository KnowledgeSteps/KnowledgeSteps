package com.zhihu.hackathon.reading;

import com.zhihu.hackathon.session.SessionException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class ReadingService {
  public record Overview(String contentMarkdown, String generatedAt, boolean saved) {}
  public record KnowledgeCard(String nodeId, String sessionId, String nodeName, String description,
      String contentMarkdown, String generatedAt, String savedAt, String sessionTarget, boolean understood) {}
  public record KnowledgeCards(List<KnowledgeCard> items, long total, int page, int pageSize) {}
  public record Explanation(String id, String sessionId, String nodeId, String nodeName, String quote,
      String explanationMarkdown, String sourceTitle, String sourceUrl, String createdAt, boolean understood, boolean saved, String sessionTarget) {}
  public record Doubts(List<Explanation> items, long total, int page, int pageSize) {}
  private record Node(long id, long sessionId, String name, String description, String target) {}
  private record Source(Long resourceId, String title, String url, String context) {}
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  private final ReadingModel model;
  private final ReadingAdmission admission;
  public ReadingService(JdbcTemplate jdbc, PlatformTransactionManager manager, ReadingModel model, ReadingAdmission admission) {
    this.jdbc = jdbc; tx = new TransactionTemplate(manager); this.model = model; this.admission = admission;
  }
  public Overview overview(long user, String sessionId, String nodeId) {
    Node node = ownedNode(user, sessionId, nodeId);
    Overview existing = cached(node.id());
    if (existing != null) return existing;
    return admission.execute(user, () -> {
      Overview cached = cached(node.id());
      if (cached != null) return cached;
      String generated = model.overview(node.target(), node.name(), node.description());
      return tx.execute(status -> {
        lockSession(user, node.sessionId());
        ownedNode(user, sessionId, nodeId);
        jdbc.update("INSERT OR IGNORE INTO node_overviews(node_id,content_markdown,generated_at) VALUES (?,?,?)",
            node.id(), generated, Instant.now().toString());
        return cached(node.id());
      });
    });
  }
  private Overview cached(long node) {
    var rows = jdbc.query("SELECT content_markdown,generated_at,EXISTS(SELECT 1 FROM knowledge_card_favorites f WHERE f.node_id=o.node_id) FROM node_overviews o WHERE node_id=?",
        (rs, row) -> new Overview(rs.getString(1), rs.getString(2), rs.getBoolean(3)), node);
    return rows.isEmpty() ? null : rows.getFirst();
  }
  public Explanation explain(long user, String sessionId, String nodeId, String resourceId, String quote, String context) {
    String selection = requireText(quote, 1000, "请选择 1～1000 字的内容。");
    if (context != null && context.codePointCount(0, context.length()) > 2000) throw invalid("补充上下文最多 2000 字。");
    Node node = ownedNode(user, sessionId, nodeId);
    Source source = source(node, resourceId, context);
    return admission.execute(user, () -> {
      String generated = model.explain(node.target(), node.name(), selection, source.context());
      return tx.execute(status -> {
        lockSession(user, node.sessionId());
        // 模型生成期间历史/资料可能被删除；重新检查后再保存，避免悬空结果。
        ownedNode(user, sessionId, nodeId);
        source(node, resourceId, context);
        pruneDrafts(user);
        jdbc.update("DELETE FROM reading_explanations WHERE user_id=? AND saved=0 AND id NOT IN (SELECT id FROM reading_explanations WHERE user_id=? AND saved=0 ORDER BY created_at DESC,id DESC LIMIT 19)", user, user);
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO reading_explanations(id,user_id,session_id,node_id,resource_id,node_name,quote,explanation_markdown,source_title,source_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            id,user,node.sessionId(),node.id(),source.resourceId(),node.name(),selection,generated,source.title(),source.url(),Instant.now().toString());
        return find(user, id, false);
      });
    });
  }
  private Source source(Node node, String resourceId, String context) {
    if (resourceId == null) return new Source(null, node.name() + " · 知识点讲解", null,
        "节点简介：" + node.description() + "\n用户提供的片段：" + (context == null ? "" : context));
    long id = positiveId(resourceId);
    var rows = jdbc.query("SELECT title,url,summary FROM node_resources WHERE id=? AND node_id=?",
        (rs,row) -> new Source(id, rs.getString(1), safeSourceUrl(rs.getString(2)), "资料摘要（非全文）：" + limit(rs.getString(3), 6000)), id,node.id());
    if (rows.isEmpty()) throw missing();
    return rows.getFirst();
  }
  public Explanation save(long user, String id) {
    validateUuid(id);
    return tx.execute(status -> {
      lockUser(user);
      pruneDrafts(user);
      Explanation existing = find(user, id, false);
      if (existing.saved()) return existing;
      long count = jdbc.queryForObject("SELECT count(*) FROM reading_explanations WHERE user_id=? AND saved=1", Long.class, user);
      if (count >= 200) throw new SessionException(409,"DOUBT_LIMIT_REACHED","疑惑本最多保存 200 条，请删除部分记录后再保存。");
      jdbc.update("UPDATE reading_explanations SET saved=1 WHERE id=? AND user_id=?",id,user);
      return find(user,id,true);
    });
  }
  public Doubts list(long user, int page) {
    if (page < 1 || page > 10000) throw invalid("页码不正确。");
    long count = jdbc.queryForObject("SELECT count(*) FROM reading_explanations WHERE user_id=? AND saved=1",Long.class,user);
    var items = jdbc.query("SELECT reading_explanations.*, (SELECT target_name FROM learning_sessions s WHERE s.id=reading_explanations.session_id AND s.user_id=reading_explanations.user_id) AS session_target FROM reading_explanations WHERE user_id=? AND saved=1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET ?",
        this::map,user,(page-1)*20);
    return new Doubts(items,count,page,20);
  }
  public Explanation mark(long user,String id,boolean understood) {
    validateUuid(id);
    return tx.execute(status -> {
      if (jdbc.update("UPDATE reading_explanations SET understood=? WHERE user_id=? AND id=? AND saved=1",understood ? 1 : 0,user,id)==0) throw missing();
      return find(user,id,true);
    });
  }
  public void delete(long user,String id) {
    validateUuid(id);
    if (jdbc.update("DELETE FROM reading_explanations WHERE user_id=? AND id=? AND saved=1",user,id)==0) throw missing();
  }
  @org.springframework.scheduling.annotation.Scheduled(fixedDelay=3_600_000,initialDelay=3_600_000)
  public void pruneExpiredDrafts() {
    jdbc.update("DELETE FROM reading_explanations WHERE saved=0 AND created_at<?",Instant.now().minusSeconds(86400).toString());
  }
  private void pruneDrafts(long user) {
    jdbc.update("DELETE FROM reading_explanations WHERE user_id=? AND saved=0 AND created_at<?",user,Instant.now().minusSeconds(86400).toString());
  }
  private Explanation find(long user, String id, boolean saved) {
    var rows = jdbc.query("SELECT reading_explanations.*, (SELECT target_name FROM learning_sessions s WHERE s.id=reading_explanations.session_id AND s.user_id=reading_explanations.user_id) AS session_target FROM reading_explanations WHERE user_id=? AND id=?" + (saved ? " AND saved=1" : ""),this::map,user,id);
    if (rows.isEmpty()) throw missing();
    return rows.getFirst();
  }
  private Explanation map(ResultSet rs, int row) throws SQLException {
    return new Explanation(rs.getString("id"),rs.getString("session_id"),rs.getString("node_id"),rs.getString("node_name"),
        rs.getString("quote"),rs.getString("explanation_markdown"),rs.getString("source_title"),safeSourceUrl(rs.getString("source_url")),
        rs.getString("created_at"),rs.getInt("understood")==1,rs.getInt("saved")==1,rs.getString("session_target"));
  }
  private Node ownedNode(long user,String sessionId,String nodeId) {
    long session = positiveId(sessionId), node = positiveId(nodeId);
    var rows = jdbc.query("SELECT n.id,n.session_id,n.name,n.description,s.target_name FROM knowledge_nodes n JOIN learning_sessions s ON s.id=n.session_id WHERE s.user_id=? AND s.id=? AND n.id=?",
        (rs,row) -> new Node(rs.getLong(1),rs.getLong(2),rs.getString(3),rs.getString(4),rs.getString(5)),user,session,node);
    if (rows.isEmpty()) throw missing();
    return rows.getFirst();
  }
  private void lockSession(long user,long session) {
    if (jdbc.update("UPDATE learning_sessions SET status=status WHERE id=? AND user_id=?",session,user)==0) throw missing();
  }
  private void lockUser(long user) {
    if (jdbc.update("UPDATE users SET nickname=nickname WHERE id=?",user)==0) throw missing();
  }
  private static long positiveId(String value) {
    try { if (value == null || !value.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException(); return Long.parseLong(value); }
    catch (NumberFormatException ex) { throw invalid("记录标识不正确。"); }
  }
  private static void validateUuid(String id) {
    try { if (id == null || !UUID.fromString(id).toString().equals(id)) throw new IllegalArgumentException(); }
    catch (IllegalArgumentException ex) { throw invalid("解释标识不正确。"); }
  }
  private static String limit(String value,int max) { return value == null ? "" : value.substring(0,Math.min(value.length(),max)); }
  static String safeSourceUrl(String value) {
    if (value == null) return null;
    try {
      var uri = java.net.URI.create(value);
      String host = uri.getHost();
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null && host != null
          && (uri.getPort() == -1 || uri.getPort() == 443)
          && (host.equalsIgnoreCase("zhihu.com") || host.toLowerCase(java.util.Locale.ROOT).endsWith(".zhihu.com")) ? value : null;
    } catch (IllegalArgumentException ex) { return null; }
  }
  static String requireText(String value,int max,String message) {
    // 与前端 Array.from 和 SQLite length(TEXT) 一致，按 Unicode 码点而非 UTF-16 代码单元计数。
    if (value == null || value.isBlank() || value.codePointCount(0, value.length()) > max) throw invalid(message);
    return value.strip();
  }
  static SessionException invalid(String message) { return new SessionException(400,"INVALID_READING_REQUEST",message); }
  private static SessionException missing() { return new SessionException(404,"READING_NOT_FOUND","阅读记录不存在或已删除。"); }

  public Overview saveCard(long user, String sessionId, String nodeId) {
    return tx.execute(status -> {
      lockUser(user);
      Node node = ownedNode(user, sessionId, nodeId);
      Overview overview = cached(node.id());
      if (overview == null) throw new SessionException(409,"CARD_NOT_READY","知识点卡片尚未生成，请生成后再收藏。");
      if (overview.saved()) return overview;
      long count = jdbc.queryForObject("SELECT count(*) FROM knowledge_card_favorites WHERE user_id=?",Long.class,user);
      if (count >= 200) throw new SessionException(409,"CARD_LIMIT_REACHED","最多收藏 200 张知识卡片，请取消部分收藏后再试。");
      jdbc.update("INSERT INTO knowledge_card_favorites(node_id,user_id,saved_at) VALUES (?,?,?)",node.id(),user,Instant.now().toString());
      return cached(node.id());
    });
  }
  @org.springframework.transaction.annotation.Transactional(readOnly=true)
  public KnowledgeCards cards(long user, int page) {
    if(page < 1 || page > 10000) throw invalid("页码不正确。");
    long count = jdbc.queryForObject("SELECT count(*) FROM knowledge_card_favorites WHERE user_id=?",Long.class,user);
    var items = jdbc.query("SELECT n.id,n.session_id,n.name,n.description,o.content_markdown,o.generated_at,f.saved_at,s.target_name,f.understood FROM knowledge_card_favorites f JOIN knowledge_nodes n ON n.id=f.node_id JOIN learning_sessions s ON s.id=n.session_id JOIN node_overviews o ON o.node_id=n.id WHERE f.user_id=? AND s.user_id=? ORDER BY f.saved_at DESC,n.id DESC LIMIT 20 OFFSET ?",
        (rs,row)->new KnowledgeCard(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7),rs.getString(8),rs.getInt(9)==1),user,user,(page-1)*20);
    return new KnowledgeCards(items,count,page,20);
  }
  public void removeCard(long user, String nodeId) {
    // 取消收藏只移除收藏关系，保留节点及已生成的讲解。
    jdbc.update("DELETE FROM knowledge_card_favorites WHERE user_id=? AND node_id=?",user,positiveId(nodeId));
  }
  public void markCard(long user,String nodeId,boolean understood) {
    if(jdbc.update("UPDATE knowledge_card_favorites SET understood=? WHERE user_id=? AND node_id=?",understood ? 1 : 0,user,positiveId(nodeId))==0) throw missing();
  }
}
