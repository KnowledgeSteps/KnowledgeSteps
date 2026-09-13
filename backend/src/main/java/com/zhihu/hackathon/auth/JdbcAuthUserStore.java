package com.zhihu.hackathon.auth;

import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcAuthUserStore implements AuthUserStore {
  private final JdbcTemplate jdbc;
  public JdbcAuthUserStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public Profile profile(long id) {
    return jdbc.queryForObject("SELECT nickname, avatar_url FROM users WHERE id=?",
        (rs, row) -> new Profile(rs.getString("nickname"), rs.getString("avatar_url")), id);
  }
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
  public long adminUser(String username) {
    String external = "admin:" + username;
    jdbc.update("INSERT INTO users(zhihu_user_id,nickname,created_at) VALUES (?,?,?) ON CONFLICT(zhihu_user_id) DO NOTHING",
        external, "管理员", Instant.now().toString());
    return jdbc.queryForObject("SELECT id FROM users WHERE zhihu_user_id=?", Long.class, external);
  }
  public boolean isAdmin(long id) {
    return Boolean.TRUE.equals(jdbc.queryForObject(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id=? AND zhihu_user_id LIKE 'admin:%')", Boolean.class, id));
  }
  public long zhihuUser(String externalId, String nickname, String avatarUrl) {
    if (externalId == null || !externalId.matches("[A-Za-z0-9_-]{1,128}")) {
      throw new IllegalArgumentException("Invalid verified Zhihu identity");
    }
    // 独立命名空间，不能与管理员或测试身份合并。重新登录只更新展示资料。
    String external = "zhihu:" + externalId;
    jdbc.update("""
        INSERT INTO users(zhihu_user_id,nickname,avatar_url,created_at) VALUES (?,?,?,?)
        ON CONFLICT(zhihu_user_id) DO UPDATE SET nickname=excluded.nickname,avatar_url=excluded.avatar_url
        """, external, nickname, avatarUrl, Instant.now().toString());
    return jdbc.queryForObject("SELECT id FROM users WHERE zhihu_user_id=?", Long.class, external);
  }
}
