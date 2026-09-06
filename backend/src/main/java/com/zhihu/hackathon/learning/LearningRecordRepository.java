package com.zhihu.hackathon.learning;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class LearningRecordRepository {
  private final JdbcClient jdbc;

  public LearningRecordRepository(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  @Transactional
  public LearningRecord create(String userId, String sourceUrl, String status) {
    jdbc.sql("INSERT INTO learning_records(user_id, source_url, status) VALUES (:userId, :sourceUrl, :status)")
        .param("userId", userId)
        .param("sourceUrl", sourceUrl)
        .param("status", status)
        .update();
    return jdbc.sql("SELECT id, user_id, source_url, status FROM learning_records WHERE id = last_insert_rowid()")
        .query((rs, rowNum) -> new LearningRecord(rs.getLong("id"), rs.getString("user_id"), rs.getString("source_url"), rs.getString("status")))
        .single();
  }

  public Optional<LearningRecord> findOwnedBy(long id, String userId) {
    return jdbc.sql("SELECT id, user_id, source_url, status FROM learning_records WHERE id = :id AND user_id = :userId")
        .param("id", id)
        .param("userId", userId)
        .query((rs, rowNum) -> new LearningRecord(rs.getLong("id"), rs.getString("user_id"), rs.getString("source_url"), rs.getString("status")))
        .optional();
  }
}
