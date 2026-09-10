package com.zhihu.hackathon.auth;

import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAuthUserStore implements AuthUserStore {
  private final JdbcTemplate jdbc;
  public JdbcAuthUserStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public boolean isLoginUser(long id) {
    return Boolean.TRUE.equals(jdbc.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND zhihu_user_id NOT LIKE 'local-test:%')", Boolean.class, id));
  }
  public long localUser(String name) {
    String external = "local-test:" + name;
    jdbc.update("INSERT INTO users(zhihu_user_id,nickname,created_at) VALUES (?,?,?) ON CONFLICT(zhihu_user_id) DO NOTHING",
        external, "本地测试用户", Instant.now().toString());
    return jdbc.queryForObject("SELECT id FROM users WHERE zhihu_user_id=?", Long.class, external);
  }
}
