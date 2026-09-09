package com.zhihu.hackathon.auth;

public final class AuthException extends RuntimeException {
  private final int status;
  private final String code;
  public AuthException(int status, String code, String message) {
    super(message); this.status = status; this.code = code;
  }
  public int status() { return status; }
  public String code() { return code; }
  public static AuthException unauthorized() { return new AuthException(401, "UNAUTHORIZED", "请先登录。"); }
}
