package com.zhihu.hackathon.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import java.nio.file.Path;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import com.zhihu.hackathon.LearningApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FlywayMigrationTest {
  @TempDir Path directory;

  @Test
  void refusesNonEmptyDatabaseWithoutExplicitBaseline() throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("unmanaged.db");
    try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement()) {
      statement.execute("CREATE TABLE existing_data (value TEXT)");
      statement.execute("INSERT INTO existing_data VALUES ('preserve-me')");
    }
    assertThatThrownBy(() -> Flyway.configure().dataSource(url, null, null).load().migrate())
        .isInstanceOf(FlywayException.class).hasMessageContaining("non-empty schema");
    try (var connection = DriverManager.getConnection(url); var statement = connection.createStatement();
         var result = statement.executeQuery("SELECT value FROM existing_data")) {
      assertThat(result.next()).isTrue();
      assertThat(result.getString(1)).isEqualTo("preserve-me");
    }
  }

  @Test
  void restartsApplicationWithTheSameDatabaseAndEnablesForeignKeys() {
    String url = "jdbc:sqlite:" + directory.resolve("restart.db");
    for (int start = 0; start < 2; start++) {
      try (var context = new SpringApplicationBuilder(LearningApplication.class)
          .web(WebApplicationType.NONE)
          .run("--spring.datasource.url=" + url, "--spring.flyway.baseline-on-migrate=false")) {
        var jdbc = context.getBean(JdbcTemplate.class);
        assertThat(jdbc.queryForObject("PRAGMA foreign_keys", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success=1", Integer.class))
            .isEqualTo(3);
        if (start == 0) {
          jdbc.update("INSERT INTO users (zhihu_user_id, created_at) VALUES ('restart-user', '2026-09-08T00:00:00Z')");
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE zhihu_user_id='restart-user'", Integer.class))
            .isEqualTo(1);
      }
    }
  }

  @Test
  void migratesEmptyDatabaseAndDoesNotRepeatMigrations() throws Exception {
    String url = "jdbc:sqlite:" + directory.resolve("empty.db");
    Flyway flyway = Flyway.configure().dataSource(url, null, null).load();
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(3);
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
    assertThat(flyway.migrate().migrationsExecuted).isEqualTo(3);
    try (var connection = DriverManager.getConnection(url);
         var statement = connection.createStatement();
         var result = statement.executeQuery("SELECT user_id FROM learning_records WHERE id=1")) {
      assertThat(result.next()).isTrue();
      assertThat(result.getString(1)).isEqualTo("original-user");
    }
    assertThat(flyway.migrate().migrationsExecuted).isZero();
  }
}
