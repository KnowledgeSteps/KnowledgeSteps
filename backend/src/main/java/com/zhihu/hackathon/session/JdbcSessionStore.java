package com.zhihu.hackathon.session;

import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import static com.zhihu.hackathon.session.Generation.*;

@Repository
public class JdbcSessionStore implements SessionStore {
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  public JdbcSessionStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
    this.jdbc = jdbc; this.tx = new TransactionTemplate(manager);
  }
  private long insert(String sql, Object... args) {
    jdbc.update(sql, args);
    return Objects.requireNonNull(jdbc.queryForObject("SELECT last_insert_rowid()", Long.class));
  }
  public long create(long userId, String target) {
    return tx.execute(s -> insert("INSERT INTO learning_sessions(user_id,target_name,status,created_at,updated_at) VALUES (?,?,'GENERATING_GRAPH',?,?)",
        userId, target, Instant.now().toString(), Instant.now().toString()));
  }
  public Snapshot findOwned(long userId, long id) {
    return tx.execute(s -> {
      var rows = jdbc.query("SELECT target_name,status,error_code,error_message FROM learning_sessions WHERE id=? AND user_id=?",
          (rs, row) -> new String[]{rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4)}, id,userId);
      if (rows.isEmpty()) throw new SessionException(404,"NOT_FOUND","任务不存在。");
      var states = jdbc.query("SELECT id,resource_status FROM knowledge_nodes WHERE session_id=? AND is_target=0 ORDER BY id",
          (rs,row) -> new String[]{rs.getString(1),rs.getString(2)},id);
      int processed = (int) states.stream().filter(n -> !n[1].equals("PENDING")).count();
      var warnings = states.stream().filter(n -> n[1].equals("FAILED"))
          .map(n -> new Warning(n[0],"RESOURCE_SEARCH_FAILED","该节点资料搜索失败。")).toList();
      String[] row = rows.getFirst();
      return new Snapshot(Long.toString(id),row[0],row[1],new Progress(processed,states.size()),warnings,
          row[2] == null ? null : new Error(row[2],row[3]));
    });
  }
  public List<SavedNode> saveGraph(long id, String target, ValidGraph validated) {
    return tx.execute(s -> {
      Map<String,Long> ids = new HashMap<>();
      List<SavedNode> saved = new ArrayList<>();
      for (Node n : validated.graph().nodes()) {
        long nodeId = insert("INSERT INTO knowledge_nodes(session_id,name,description,level) VALUES (?,?,?,?)",
            id,n.name(),n.description(),validated.levels().get(n.key()));
        ids.put(n.key(),nodeId); saved.add(new SavedNode(Long.toString(nodeId),n.name(),n.description()));
      }
      ids.put("target",insert("INSERT INTO knowledge_nodes(session_id,name,description,level,is_target,resource_status) VALUES (?,?,?,?,1,'NOT_APPLICABLE')",
          id,target,validated.graph().targetDescription(),validated.levels().get("target")));
      for (Edge e : validated.graph().edges()) jdbc.update("INSERT INTO knowledge_edges(session_id,prerequisite_node_id,dependent_node_id) VALUES (?,?,?)",id,ids.get(e.from()),ids.get(e.to()));
      status(id,"GENERATING_QUESTIONS");
      return List.copyOf(saved);
    });
  }
  public void saveResources(long nodeId, List<Resource> resources, boolean failed) {
    tx.executeWithoutResult(s -> {
      if (resources.size() > 5 || (failed && !resources.isEmpty())) throw new IllegalArgumentException("INVALID_RESOURCES");
      jdbc.update("DELETE FROM node_resources WHERE node_id=?", nodeId);
      for (int i=0;i<resources.size();i++) {
        Resource r=resources.get(i);
        jdbc.update("INSERT INTO node_resources(node_id,title,url,summary,author_name,vote_count,sort_order,fetched_at) VALUES (?,?,?,?,?,?,?,?)",
            nodeId,r.title(),r.url(),r.summary(),r.authorName(),r.voteCount(),i,Instant.now().toString());
      }
      jdbc.update("UPDATE knowledge_nodes SET resource_status=? WHERE id=?",failed?"FAILED":resources.isEmpty()?"EMPTY":"READY",nodeId);
    });
  }
  public List<ResourceRequest> pendingResources(long sessionId) {
    return jdbc.query("""
        SELECT n.id,n.name,a.answer_value FROM knowledge_nodes n
        JOIN assessment_questions q ON q.node_id=n.id
        JOIN assessment_answers a ON a.question_id=q.id
        WHERE n.session_id=? AND n.is_target=0 AND n.resource_status='PENDING'
          AND a.answer_value<>'VERY_FAMILIAR'
        ORDER BY n.id
        """, (rs,row) -> new ResourceRequest(rs.getLong(1),rs.getString(2),ResourcePolicy.limit(rs.getString(3))),sessionId);
  }
  public void finishResources(long sessionId) {
    tx.executeWithoutResult(s -> {
      jdbc.update("UPDATE knowledge_nodes SET resource_status='FAILED' WHERE session_id=? AND is_target=0 AND resource_status='PENDING'",sessionId);
      String now = Instant.now().toString();
      jdbc.update("UPDATE learning_sessions SET status='COMPLETED',completed_at=?,updated_at=? WHERE id=? AND status='SEARCHING_RESOURCES'",now,now,sessionId);
    });
  }
  private void status(long id,String status) { jdbc.update("UPDATE learning_sessions SET status=?,updated_at=? WHERE id=?",status,Instant.now().toString(),id); }
  public void generatingQuestions(long id) { tx.executeWithoutResult(s -> status(id,"GENERATING_QUESTIONS")); }
  public void ready(long id,List<Question> questions) {
    tx.executeWithoutResult(s -> {
      for(int i=0;i<questions.size();i++) {
        Question q=questions.get(i);
        jdbc.update("INSERT INTO assessment_questions(node_id,question_text,hint,sort_order) VALUES (?,?,?,?)",Long.parseLong(q.nodeId()),q.questionText(),q.hint(),i);
      }
      status(id,"READY");
    });
  }
  public void fail(long id,String code,String message) {
    jdbc.update("UPDATE learning_sessions SET status='FAILED',error_code=?,error_message=?,updated_at=? WHERE id=? AND status IN ('GENERATING_GRAPH','SEARCHING_RESOURCES','GENERATING_QUESTIONS')",code,message,Instant.now().toString(),id);
  }
  public void recoverInterrupted() {
    jdbc.update("UPDATE learning_sessions SET status='READY',completed_at=NULL,error_code=NULL,error_message=NULL,updated_at=? WHERE status='SEARCHING_RESOURCES' AND NOT EXISTS (SELECT 1 FROM knowledge_nodes n LEFT JOIN assessment_questions q ON q.node_id=n.id LEFT JOIN assessment_answers a ON a.question_id=q.id WHERE n.session_id=learning_sessions.id AND n.is_target=0 AND a.id IS NULL)",Instant.now().toString());
    jdbc.update("UPDATE learning_sessions SET status='FAILED',error_code='GENERATION_INTERRUPTED',error_message='服务已重启，请重新创建任务。',updated_at=? WHERE status IN ('GENERATING_GRAPH','SEARCHING_RESOURCES','GENERATING_QUESTIONS')",Instant.now().toString());
  }

  public QuestionsResponse findQuestionsOwned(long userId, long sessionId) {
    return tx.execute(status -> {
      String sessionStatus = jdbc.query("""
        SELECT status
        FROM learning_sessions
        WHERE id = ? AND user_id = ?
        """,
              rs -> rs.next() ? rs.getString("status") : null,
              sessionId,
              userId
      );

      if (sessionStatus == null) {
        throw new SessionException(404, "NOT_FOUND", "任务不存在。");
      }

      if (!"READY".equals(sessionStatus) && !"COMPLETED".equals(sessionStatus)) {
        throw new SessionException(409, "SESSION_NOT_READY", "任务尚未准备完成。");
      }

      List<QuestionsResponse.QuestionItem> questions = jdbc.query("""
        SELECT
          q.id AS question_id,
          n.id AS node_id,
          n.name AS node_name,
          q.question_text,
          q.hint,
          a.answer_value
        FROM assessment_questions q
        JOIN knowledge_nodes n ON n.id = q.node_id
        LEFT JOIN assessment_answers a ON a.question_id = q.id
        WHERE n.session_id = ?
          AND n.is_target = 0
        ORDER BY q.sort_order ASC, q.id ASC
        """,
              (rs, rowNum) -> new QuestionsResponse.QuestionItem(
                      Long.toString(rs.getLong("question_id")),
                      Long.toString(rs.getLong("node_id")),
                      rs.getString("node_name"),
                      rs.getString("question_text"),
                      rs.getString("hint"),
                      QuestionsResponse.FIXED_OPTIONS,
                      rs.getString("answer_value")
              ),
              sessionId
      );

      return new QuestionsResponse(questions);
    });
  }

  public AnswerResponse saveAnswerOwned(long userId, long sessionId, long questionId, String answer) {
    if (answer == null || !Set.of("VERY_FAMILIAR", "BASICALLY_KNOW", "HEARD_OF", "DONT_KNOW").contains(answer)) {
      throw new SessionException(400, "INVALID_ANSWER", "答案选项无效。");
    }
    return tx.execute(status -> {
      var sessions = jdbc.query("SELECT status FROM learning_sessions WHERE id=? AND user_id=?",
          (rs, row) -> rs.getString(1), sessionId, userId);
      if (sessions.isEmpty()) throw new SessionException(404, "NOT_FOUND", "任务不存在。");
      String sessionStatus = sessions.getFirst();
      if (!"READY".equals(sessionStatus) && !"COMPLETED".equals(sessionStatus)) {
        throw new SessionException(409, "SESSION_NOT_READY", "任务尚未准备完成。");
      }
      var nodes = jdbc.query("""
          SELECT n.id, a.answer_value
          FROM assessment_questions q
          JOIN knowledge_nodes n ON n.id=q.node_id
          LEFT JOIN assessment_answers a ON a.question_id=q.id
          WHERE q.id=? AND n.session_id=? AND n.is_target=0
          """, (rs, row) -> new Object[]{rs.getLong(1), rs.getString(2)}, questionId, sessionId);
      if (nodes.isEmpty()) throw new SessionException(404, "NOT_FOUND", "题目不存在。");
      long nodeId = (long) nodes.getFirst()[0];
      String previousAnswer = (String) nodes.getFirst()[1];
      String mastery = answer.equals("VERY_FAMILIAR") ? "MASTERED" : "TO_LEARN";
      Instant now = Instant.now();
      if (previousAnswer == null) {
        jdbc.update("INSERT INTO assessment_answers(question_id,answer_value,answered_at) VALUES (?,?,?)", questionId, answer, now.toString());
      } else {
        jdbc.update("UPDATE assessment_answers SET answer_value=?,answered_at=? WHERE question_id=?", answer, now.toString(), questionId);
      }
      jdbc.update("UPDATE knowledge_nodes SET mastery_status=? WHERE id=?", mastery, nodeId);
      if (!answer.equals(previousAnswer)) {
        jdbc.update("DELETE FROM node_resources WHERE node_id=?", nodeId);
        jdbc.update("UPDATE knowledge_nodes SET resource_status=? WHERE id=?",
            ResourcePolicy.limit(answer) == 0 ? "NOT_APPLICABLE" : "PENDING", nodeId);
      }
      if ("COMPLETED".equals(sessionStatus) && !answer.equals(previousAnswer)) {
        jdbc.update("UPDATE learning_sessions SET status='READY',completed_at=NULL,updated_at=? WHERE id=?", now.toString(), sessionId);
      }
      Integer answered = jdbc.queryForObject("""
          SELECT COUNT(*) FROM assessment_answers a
          JOIN assessment_questions q ON q.id=a.question_id
          JOIN knowledge_nodes n ON n.id=q.node_id
          WHERE n.session_id=? AND n.is_target=0
          """, Integer.class, sessionId);
      Integer total = jdbc.queryForObject("""
          SELECT COUNT(*) FROM assessment_questions q
          JOIN knowledge_nodes n ON n.id=q.node_id
          WHERE n.session_id=? AND n.is_target=0
          """, Integer.class, sessionId);
      return new AnswerResponse(Long.toString(questionId), mastery, answered, total);
    });
  }

  public CompletionResponse completeOwned(long userId, long sessionId) {
    return tx.execute(status -> {
      var sessions = jdbc.query("SELECT target_name,status FROM learning_sessions WHERE id=? AND user_id=?",
          (rs, row) -> new String[]{rs.getString(1), rs.getString(2)}, sessionId, userId);
      if (sessions.isEmpty()) throw new SessionException(404, "NOT_FOUND", "任务不存在。");
      String target = sessions.getFirst()[0];
      String sessionStatus = sessions.getFirst()[1];
      if (!"READY".equals(sessionStatus) && !"COMPLETED".equals(sessionStatus) && !"SEARCHING_RESOURCES".equals(sessionStatus)) {
        throw new SessionException(409, "SESSION_NOT_READY", "任务尚未准备完成。");
      }
      Integer total = jdbc.queryForObject("""
          SELECT COUNT(*) FROM assessment_questions q
          JOIN knowledge_nodes n ON n.id=q.node_id
          WHERE n.session_id=? AND n.is_target=0
          """, Integer.class, sessionId);
      Integer answered = jdbc.queryForObject("""
          SELECT COUNT(*) FROM assessment_answers a
          JOIN assessment_questions q ON q.id=a.question_id
          JOIN knowledge_nodes n ON n.id=q.node_id
          WHERE n.session_id=? AND n.is_target=0
          """, Integer.class, sessionId);
      if (!Objects.equals(total, answered)) {
        throw new SessionException(409, "ANSWERS_INCOMPLETE", "还有题目未作答，请完成后再查看结果。");
      }
      // 已派发的搜索必须由 worker 结束，最后一个节点保存与收尾之间也不能提前解锁答卷。
      String nextStatus = sessionStatus.equals("SEARCHING_RESOURCES") || !pendingResources(sessionId).isEmpty()
          ? "SEARCHING_RESOURCES" : "COMPLETED";
      if (!sessionStatus.equals(nextStatus)) {
        String now = Instant.now().toString();
        jdbc.update("UPDATE learning_sessions SET status=?,completed_at=?,updated_at=?,error_code=NULL,error_message=NULL WHERE id=?",
            nextStatus, nextStatus.equals("COMPLETED") ? now : null, now, sessionId);
      }
      return completedResult(sessionId, target, nextStatus);
    });
  }

  public ResourcesResponse findResourcesOwned(long userId, long sessionId, long nodeId) {
    return tx.execute(status -> {
      var sessions = jdbc.query("SELECT status FROM learning_sessions WHERE id=? AND user_id=?",
          (rs, row) -> rs.getString(1), sessionId, userId);
      if (sessions.isEmpty()) throw new SessionException(404, "NOT_FOUND", "任务不存在。");
      if (!"COMPLETED".equals(sessions.getFirst())) {
        throw new SessionException(409, "SESSION_NOT_COMPLETED", "请先完成答卷后再查看资料。");
      }
      var nodes = jdbc.query("""
          SELECT name,description,is_target,mastery_status,resource_status
          FROM knowledge_nodes WHERE id=? AND session_id=?
          """, (rs, row) -> new ResourceNode(rs.getString(1), rs.getString(2), rs.getInt(3) == 1,
              rs.getString(4), rs.getString(5)), nodeId, sessionId);
      if (nodes.isEmpty()) throw new SessionException(404, "NOT_FOUND", "节点不存在。");
      ResourceNode node = nodes.getFirst();
      if (node.target || "MASTERED".equals(node.mastery)) {
        return new ResourcesResponse(Long.toString(nodeId), node.name, node.description, "NOT_APPLICABLE", List.of());
      }
      List<ResourcesResponse.ResourceItem> resources = jdbc.query("""
          SELECT id,title,url,summary,author_name,vote_count
          FROM node_resources WHERE node_id=? ORDER BY sort_order,id
          """, (rs, row) -> {
            Number voteCount = (Number) rs.getObject(6);
            return new ResourcesResponse.ResourceItem(Long.toString(rs.getLong(1)), rs.getString(2),
                rs.getString(3), rs.getString(4), rs.getString(5), voteCount == null ? null : voteCount.longValue());
          }, nodeId);
      return new ResourcesResponse(Long.toString(nodeId), node.name, node.description, node.resourceStatus, resources);
    });
  }

  private CompletionResponse completedResult(long sessionId, String target, String resultStatus) {
    List<CompletionResponse.Node> nodes = jdbc.query("""
        SELECT n.id,n.name,n.is_target,n.level,a.answer_value FROM knowledge_nodes n
        LEFT JOIN assessment_questions q ON q.node_id=n.id
        LEFT JOIN assessment_answers a ON a.question_id=q.id
        WHERE n.session_id=? ORDER BY n.level,n.id
        """, (rs,row) -> new CompletionResponse.Node(rs.getString(1),rs.getString(2),rs.getInt(3)==1,
            rs.getInt(4),rs.getString(5),rs.getInt(3)==1?0:ResourcePolicy.limit(rs.getString(5))),sessionId);
    List<CompletionResponse.Edge> orderedEdges = jdbc.query("SELECT prerequisite_node_id,dependent_node_id FROM knowledge_edges WHERE session_id=? ORDER BY id",
        (rs,row) -> new CompletionResponse.Edge(rs.getString(1),rs.getString(2)),sessionId);
    int missing = (int) nodes.stream().filter(node -> !node.isTarget() && !"VERY_FAMILIAR".equals(node.answer())).count();
    return new CompletionResponse(Long.toString(sessionId), resultStatus, target, missing, nodes, orderedEdges);
  }

  private record ResourceNode(String name, String description, boolean target, String mastery, String resourceStatus) {}
}
