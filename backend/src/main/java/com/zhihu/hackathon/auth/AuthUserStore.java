package com.zhihu.hackathon.auth;

/** 用户存储端口；认证逻辑不接触学习任务表。 */
public interface AuthUserStore {
  boolean isLoginUser(long id);
  long localUser(String name);
}
