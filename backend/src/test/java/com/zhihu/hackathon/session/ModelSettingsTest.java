package com.zhihu.hackathon.session;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.assertj.core.api.Assertions.*;

class ModelSettingsTest {
  @Test void defaultsHaveASingleSourceAndSettingsDoNotPrintKeys() {
    new ApplicationContextRunner().withUserConfiguration(ModelSettings.class).run(context -> {
      var settings = context.getBean(ModelSettings.class);
      assertThat(settings.baseUrl()).isEqualTo("https://api.openai-next.com/v1");
      assertThat(settings.graphModel()).isEqualTo("gemini-3-flash");
      assertThat(settings.questionModel()).isEqualTo("gemini-3.1-flash-lite");
    });
    var settings = new ModelSettings("https://example.invalid", "SECRET-key", "graph", "questions");
    assertThat(settings.toString()).doesNotContain("SECRET-key");
  }
}
