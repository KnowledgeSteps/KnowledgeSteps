package com.zhihu.hackathon.session;

/** Sanitized failure category; never expose provider bodies, prompts or credentials. */
public final class ModelGenerationException extends RuntimeException {
  public ModelGenerationException(String code) { super(code); }
}
