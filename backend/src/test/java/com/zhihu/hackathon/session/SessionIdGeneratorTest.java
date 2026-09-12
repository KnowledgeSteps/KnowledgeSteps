package com.zhihu.hackathon.session;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashSet;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import static org.assertj.core.api.Assertions.*;

class SessionIdGeneratorTest {
  @Test void sequenceOverflowRestartAndClockRollbackKeepIdsUnique() throws Exception {
    try (var ds = new SingleConnectionDataSource("jdbc:sqlite::memory:", true)) {
      var jdbc = new JdbcTemplate(ds);
      jdbc.execute("CREATE TABLE session_snowflake_state(worker_id INTEGER PRIMARY KEY,last_tick INTEGER NOT NULL)");
      var ids = new SessionIdGenerator(jdbc, 7);
      var clock = Clock.fixed(Instant.parse("2026-09-13T00:00:00Z"), ZoneOffset.UTC);
      long first = ids.nextId(clock);
      assertThat((first >>> 12) & 1023).isEqualTo(7);
      assertThat((first >>> 22) + SessionIdGenerator.EPOCH).isEqualTo(clock.millis());
      long previous = first;
      var unique = new HashSet<Long>();
      unique.add(first);
      for (int i = 0; i < 5000; i++) {
        long next = ids.nextId(clock);
        assertThat(next).isGreaterThan(previous);
        assertThat(unique.add(next)).isTrue();
        previous = next;
      }
      long restarted = new SessionIdGenerator(jdbc, 7).nextId(Clock.offset(clock, java.time.Duration.ofSeconds(-10)));
      assertThat(restarted).isGreaterThan(previous);
      assertThat(new SessionIdGenerator(jdbc, 8).nextId(clock)).isNotIn(unique);
      assertThatThrownBy(() -> new SessionIdGenerator(jdbc, 1024)).isInstanceOf(IllegalArgumentException.class);
    }
  }
}
