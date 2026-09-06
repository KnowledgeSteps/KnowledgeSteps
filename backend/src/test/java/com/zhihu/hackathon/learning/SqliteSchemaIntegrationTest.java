package com.zhihu.hackathon.learning;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class SqliteSchemaIntegrationTest {
  private static final Path TEST_DATABASE = createTemporaryDatabase();

  @Autowired
  private JdbcTemplate jdbcTemplate;

  @Autowired
  private LearningRecordService learningRecordService;

  @DynamicPropertySource
  static void sqliteProperties(DynamicPropertyRegistry registry) {
    registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + TEST_DATABASE.toAbsolutePath());
  }

  @Test
  void initializesSchemaAndKeepsLearningRecordsIsolatedByUser() {
    Integer tableCount = jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'learning_records'", Integer.class);
    assertThat(tableCount).isEqualTo(1);

    LearningRecord record = learningRecordService.save("oauth-user-a", "https://www.zhihu.com/question/1");
    assertThat(learningRecordService.getOwnedRecord("oauth-user-a", record.id())).isEqualTo(record);
    assertThatThrownBy(() -> learningRecordService.getOwnedRecord("oauth-user-b", record.id()))
        .isInstanceOf(LearningRecordNotFoundException.class);
  }

  private static Path createTemporaryDatabase() {
    try {
      return Files.createTempFile("zhihu-learning-ci-", ".db");
    } catch (IOException exception) {
      throw new IllegalStateException("无法创建临时 SQLite 测试数据库", exception);
    }
  }
}
