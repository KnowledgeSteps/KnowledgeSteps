package com.zhihu.hackathon.session;

/** Sanitized failure category; never expose provider bodies, prompts or credentials. */
public final class ModelGenerationException extends RuntimeException {
  private final String detail;
  public ModelGenerationException(String code) { this(code, code); }
  public ModelGenerationException(String code, String detail) { super(code); this.detail=detail; }
  public String detail() { return detail; }
}
