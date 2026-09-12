package com.zhihu.hackathon.session;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import java.nio.file.Path;
import java.time.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.assertj.core.api.Assertions.*;

class SessionAdmissionTest {
  @TempDir Path directory;
  HikariDataSource source;
  JdbcTemplate jdbc;
  JdbcSessionStore store;
  final AtomicLong now = new AtomicLong(Instant.parse("2026-09-13T00:00:00Z").toEpochMilli());
  final Clock clock = new Clock() {
    public ZoneId getZone() { return ZoneOffset.UTC; }
    public Clock withZone(ZoneId zone) { return this; }
    public Instant instant() { return Instant.ofEpochMilli(now.get()); }
  };
  JdbcSessionStore newStore() {
    return new JdbcSessionStore(jdbc,new DataSourceTransactionManager(source),new SessionIdGenerator(jdbc,0),clock);
  }
  @BeforeEach void setup() {
    var config=new HikariConfig();
    config.setJdbcUrl("jdbc:sqlite:"+directory.resolve("limits.db"));
    config.setMaximumPoolSize(4);
    config.setConnectionInitSql("PRAGMA foreign_keys=ON");
    config.addDataSourceProperty("busy_timeout",5000);
    source=new HikariDataSource(config);
    Flyway.configure().dataSource(source).load().migrate();
    jdbc=new JdbcTemplate(source);
    for (long user: new long[]{1,2}) jdbc.update("INSERT INTO users(id,zhihu_user_id,created_at) VALUES (?,?,'now')",user,"user-"+user);
    store=newStore();
  }
  @AfterEach void close() { source.close(); }
  @Test void rollingWindowSurvivesDeletionAndStoreRestart() {
    for (int i=0;i<10;i++) store.createWithinLimits(1,"目标");
    jdbc.update("DELETE FROM learning_sessions WHERE user_id=1");
    store=newStore();
    assertThatThrownBy(()->store.createWithinLimits(1,"删除不能重置频率"))
        .isInstanceOfSatisfying(SessionException.class,e->{ assertThat(e.code).isEqualTo("USER_CREATE_RATE_LIMITED");assertThat(e.retryAfterSeconds).isEqualTo(60); });
    assertThat(store.createWithinLimits(2,"其他用户正常" )).isPositive();
    now.addAndGet(59_999);
    assertThatThrownBy(()->store.createWithinLimits(1,"还差1毫秒"))
        .isInstanceOfSatisfying(SessionException.class,e->assertThat(e.retryAfterSeconds).isEqualTo(1));
    now.incrementAndGet();
    assertThat(store.createWithinLimits(1,"窗口已过" )).isPositive();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM session_creation_events WHERE user_id=1",Integer.class)).isEqualTo(1);
  }
  @Test void totalIncludesFailuresAndDeletionReleasesOneSlot() {
    for(int i=0;i<20;i++) { store.createWithinLimits(1,"目标"); now.addAndGet(60_000); }
    jdbc.update("UPDATE learning_sessions SET status='FAILED' WHERE user_id=1");
    assertThatThrownBy(()->store.createWithinLimits(1,"已满"))
        .isInstanceOfSatisfying(SessionException.class,e->{assertThat(e.status).isEqualTo(409);assertThat(e.code).isEqualTo("SESSION_LIMIT_REACHED");});
    jdbc.update("DELETE FROM learning_sessions WHERE id=(SELECT MIN(id) FROM learning_sessions WHERE user_id=1)");
    assertThat(store.createWithinLimits(1,"删除后创建")).isPositive();
    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions WHERE user_id=1",Integer.class)).isEqualTo(20);
  }
  @Test void concurrentRequestsCannotExceedRollingLimit() throws Exception {
    try(var pool=Executors.newFixedThreadPool(12)) {
      var gate=new CountDownLatch(1);
      var jobs=new java.util.ArrayList<Future<Boolean>>();
      for(int i=0;i<12;i++) jobs.add(pool.submit(()->{
        gate.await();
        try { newStore().createWithinLimits(1,"并发"); return true; }
        catch(SessionException e) { assertThat(e.code).isEqualTo("USER_CREATE_RATE_LIMITED");return false; }
      }));
      gate.countDown();int successes=0;
      for(var job:jobs) if(job.get(10,TimeUnit.SECONDS)) successes++;
      assertThat(successes).isEqualTo(10);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions",Integer.class)).isEqualTo(10);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM session_creation_events",Integer.class)).isEqualTo(10);
    }
  }
  @Test void concurrentRequestsCannotExceedHistoryLimit() throws Exception {
    for(int i=0;i<19;i++) store.create(1,"已有历史");
    try(var pool=Executors.newFixedThreadPool(4)) {
      var gate=new CountDownLatch(1);var jobs=new java.util.ArrayList<Future<Boolean>>();
      for(int i=0;i<4;i++) jobs.add(pool.submit(()->{
        gate.await();
        try { newStore().createWithinLimits(1,"最后一个名额"); return true; }
        catch(SessionException e) { assertThat(e.code).isEqualTo("SESSION_LIMIT_REACHED");return false; }
      }));
      gate.countDown();int successes=0;
      for(var job:jobs) if(job.get(10,TimeUnit.SECONDS)) successes++;
      assertThat(successes).isEqualTo(1);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM learning_sessions",Integer.class)).isEqualTo(20);
      assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM session_creation_events",Integer.class)).isEqualTo(1);
    }
  }
  @Test void idempotencySurvivesRestartAndDeletionButIsScopedToUser() {
    long id=store.createWithinLimits(1,"目标","request-123");
    store=newStore();
    assertThat(store.findCreation(1,"目标","request-123").sessionId()).isEqualTo(Long.toString(id));
    assertThat(store.findCreation(2,"目标","request-123")).isNull();
    assertThatThrownBy(()->store.findCreation(1,"另一个目标","request-123"))
        .isInstanceOfSatisfying(SessionException.class,e->assertThat(e.code).isEqualTo("IDEMPOTENCY_CONFLICT"));
    jdbc.update("DELETE FROM learning_sessions WHERE id=?",id);
    assertThatThrownBy(()->store.findCreation(1,"目标","request-123"))
        .isInstanceOfSatisfying(SessionException.class,e->assertThat(e.code).isEqualTo("IDEMPOTENCY_DELETED"));
    now.addAndGet(86_400_000);
    assertThat(store.findCreation(1,"目标","request-123")).isNull();
    assertThat(store.createWithinLimits(1,"目标","request-123")).isPositive();
  }
}
