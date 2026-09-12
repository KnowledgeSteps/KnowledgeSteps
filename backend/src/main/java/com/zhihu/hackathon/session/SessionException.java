package com.zhihu.hackathon.session;

public class SessionException extends RuntimeException {
  public final int status;
  public final String code;
  public final int retryAfterSeconds;
  public SessionException(int status,String code,String message) { this(status,code,message,5); }
  public SessionException(int status,String code,String message,int retryAfterSeconds) {
    super(message);this.status=status;this.code=code;this.retryAfterSeconds=retryAfterSeconds;
  }
}
