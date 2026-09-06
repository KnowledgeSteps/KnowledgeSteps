package com.zhihu.hackathon.learning;

public record LearningGenerationResult(String content, boolean retryable, String errorCode) {
  public static LearningGenerationResult completed(String content) {
    if (content == null || content.isBlank()) {
      throw new IllegalArgumentException("生成结果不能为空");
    }
    return new LearningGenerationResult(content, false, null);
  }

  public static LearningGenerationResult failed(String errorCode, boolean retryable) {
    return new LearningGenerationResult(null, retryable, errorCode);
  }
}
