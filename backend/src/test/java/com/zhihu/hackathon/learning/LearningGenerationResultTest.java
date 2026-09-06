package com.zhihu.hackathon.learning;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;

class LearningGenerationResultTest {
  @Test
  void rejectsBlankGeneratedContent() {
    assertThrows(IllegalArgumentException.class, () -> LearningGenerationResult.completed(" "));
  }

  @Test
  void marksTransientProviderFailureAsRetryable() {
    LearningGenerationResult result = LearningGenerationResult.failed("MODEL_TIMEOUT", true);
    assertTrue(result.retryable());
    assertEquals("MODEL_TIMEOUT", result.errorCode());
    assertFalse(result.errorCode().isBlank());
  }
}
