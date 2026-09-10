package com.zhihu.hackathon.session;

public class SessionException extends RuntimeException {
  public final int status;
  public final String code;
  public SessionException(int status,String code,String message) { super(message);this.status=status;this.code=code; }
}
