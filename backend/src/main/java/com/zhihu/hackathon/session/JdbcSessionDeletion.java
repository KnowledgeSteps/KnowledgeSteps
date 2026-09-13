package com.zhihu.hackathon.session;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 鉴权完成后进入短写事务，子表与主记录一起硬删除。 */
@Repository
public class JdbcSessionDeletion {
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;

  public JdbcSessionDeletion(JdbcTemplate jdbc, PlatformTransactionManager manager) {
    this.jdbc = jdbc;
    this.tx = new TransactionTemplate(manager);
  }

  public void deleteOwned(long userId, long id, Runnable afterCommit) {
    tx.executeWithoutResult(status -> {
      // 必须是本事务第一条数据库语句，不能先 SELECT 再升级写事务。
      if (jdbc.update("UPDATE learning_sessions SET status=status WHERE id=? AND user_id=?", id, userId) == 0)
        throw new SessionException(404, "NOT_FOUND", "寻路记录不存在。");
      jdbc.update("DELETE FROM assessment_answers WHERE question_id IN (SELECT q.id FROM assessment_questions q JOIN knowledge_nodes n ON n.id=q.node_id WHERE n.session_id=?)", id);
      jdbc.update("DELETE FROM assessment_questions WHERE node_id IN (SELECT id FROM knowledge_nodes WHERE session_id=?)", id);
      jdbc.update("DELETE FROM node_resources WHERE node_id IN (SELECT id FROM knowledge_nodes WHERE session_id=?)", id);
      jdbc.update("DELETE FROM knowledge_edges WHERE session_id=?", id);
      jdbc.update("DELETE FROM knowledge_nodes WHERE session_id=?", id);
      jdbc.update("DELETE FROM learning_sessions WHERE id=? AND user_id=?", id, userId);
      TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
        @Override public void afterCommit() { afterCommit.run(); }
      });
    });
  }
}
