package com.zhihu.hackathon.auth;

/** 用户存储端口；认证逻辑不接触学习任务表。 */
public interface AuthUserStore {
  record Profile(String nickname, String avatarUrl) {}
  Profile profile(long id);
  boolean isLoginUser(long id);
  default boolean isAdmin(long id) { return false; }
  long localUser(String name);
  long adminUser(String username);
  long zhihuUser(String externalId, String nickname, String avatarUrl);
}
