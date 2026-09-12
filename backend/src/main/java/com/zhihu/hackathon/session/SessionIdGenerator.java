package com.zhihu.hackathon.session;

import java.time.Clock;
import java.time.Instant;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** 41-bit milliseconds, 10-bit worker, 12-bit sequence; positive signed long. */
@Component
public class SessionIdGenerator {
  static final long EPOCH = Instant.parse("2024-01-01T00:00:00Z").toEpochMilli();
  private static final long MAX_MILLIS = (1L << 41) - 1;
  private final JdbcTemplate jdbc;
  private final int workerId;

  public SessionIdGenerator(JdbcTemplate jdbc, @Value("${app.session-id.worker-id:0}") int workerId) {
    if (workerId < 0 || workerId > 1023) throw new IllegalArgumentException("Session worker ID must be 0–1023");
    this.jdbc = jdbc;
    this.workerId = workerId;
  }

  public long nextId() { return nextId(Clock.systemUTC()); }

  // Called inside the session creation transaction. SQLite serializes this atomic write.
  long nextId(Clock clock) {
    long millis = clock.millis() - EPOCH;
    if (millis < 0 || millis > MAX_MILLIS) throw new IllegalStateException("Clock outside snowflake epoch range");
    long tick = Objects.requireNonNull(jdbc.queryForObject("""
        INSERT INTO session_snowflake_state(worker_id,last_tick) VALUES (?,?)
        ON CONFLICT(worker_id) DO UPDATE SET last_tick=MAX(last_tick+1,excluded.last_tick)
        RETURNING last_tick
        """, Long.class, workerId, millis << 12));
    long logicalMillis = tick >>> 12;
    if (logicalMillis > MAX_MILLIS) throw new IllegalStateException("Snowflake timestamp exhausted");
    // Overflow of the per-millisecond sequence advances the persisted logical clock.
    return (logicalMillis << 22) | ((long) workerId << 12) | (tick & 4095);
  }
}
