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
          id,target,"学习目标",validated.levels().get("target")));
      for (Edge e : validated.graph().edges()) jdbc.update("INSERT INTO knowledge_edges(session_id,prerequisite_node_id,dependent_node_id) VALUES (?,?,?)",id,ids.get(e.from()),ids.get(e.to()));
      status(id,"SEARCHING_RESOURCES");
      return List.copyOf(saved);
    });
  }
  public void saveResources(long nodeId, List<Resource> resources, boolean failed) {
    tx.executeWithoutResult(s -> {
      if (resources.size() > 3 || (failed && !resources.isEmpty())) throw new IllegalArgumentException("INVALID_RESOURCES");
      for (int i=0;i<resources.size();i++) {
        Resource r=resources.get(i);
        jdbc.update("INSERT INTO node_resources(node_id,title,url,summary,author_name,vote_count,sort_order,fetched_at) VALUES (?,?,?,?,?,?,?,?)",
            nodeId,r.title(),r.url(),r.summary(),r.authorName(),r.voteCount(),i,Instant.now().toString());
      }
      jdbc.update("UPDATE knowledge_nodes SET resource_status=? WHERE id=?",failed?"FAILED":resources.isEmpty()?"EMPTY":"READY",nodeId);
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
      String mastery = answer.equals("VERY_FAMILIAR") || answer.equals("BASICALLY_KNOW") ? "MASTERED" : "TO_LEARN";
      Instant now = Instant.now();
      if (previousAnswer == null) {
        jdbc.update("INSERT INTO assessment_answers(question_id,answer_value,answered_at) VALUES (?,?,?)", questionId, answer, now.toString());
      } else {
        jdbc.update("UPDATE assessment_answers SET answer_value=?,answered_at=? WHERE question_id=?", answer, now.toString(), questionId);
      }
      jdbc.update("UPDATE knowledge_nodes SET mastery_status=? WHERE id=?", mastery, nodeId);
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
}
