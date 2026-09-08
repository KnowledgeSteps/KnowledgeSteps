package com.zhihu.hackathon.learning;

import static org.assertj.core.api.Assertions.assertThat;
import java.nio.file.Path;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FlywayMigrationTest {
  @TempDir Path directory;

  @Test
  void migratesEmptyDatabaseAndDoesNotRepeatMigrations() throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("empty.db");
    Flyway flyway = Flyway.configure().dataSource(url, null, null).load();
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
    assertThat(flyway.migrate().migrationsExecuted).isZero();
    try (var connection = DriverManager.getConnection(url);
         var statement = connection.createStatement();
         var result = statement.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('users','learning_sessions','knowledge_nodes','knowledge_edges','node_resources','assessment_questions','assessment_answers','learning_records')")) {
      assertThat(result.next()).isTrue();
      assertThat(result.getInt(1)).isEqualTo(8);
    }
  }

  @Test
  void baselinesLegacyDatabaseAtZeroAndPreservesData() throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("legacy.db");
    try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
      statement.execute("CREATE TABLE learning_records (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, source_url TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      statement.execute("INSERT INTO learning_records(user_id,source_url,status) VALUES ('original-user','original-url','READY')");
    }
    Flyway flyway = Flyway.configure().dataSource(url, null, null)
        .baselineOnMigrate(true).baselineVersion("0").load();
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
    try (var connection = DriverManager.getConnection(url);
         var statement = connection.createStatement();
         var result = statement.executeQuery("SELECT user_id FROM learning_records WHERE id=1")) {
      assertThat(result.next()).isTrue();
      assertThat(result.getString(1)).isEqualTo("original-user");
    }
    assertThat(flyway.migrate().migrationsExecuted).isZero();
  }
}
