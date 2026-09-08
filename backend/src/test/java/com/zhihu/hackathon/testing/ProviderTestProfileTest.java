package com.zhihu.hackathon.testing;

import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.web.client.RestClient;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProviderTestProfileTest {
  private final WebApplicationContextRunner runner = new WebApplicationContextRunner()
      .withUserConfiguration(WebConfig.class)
      .withBean(ZhihuSearchClient.class, () -> mock(ZhihuSearchClient.class))
      .withBean(RestClient.Builder.class, RestClient::builder);

  @Configuration(proxyBeanMethods = false)
  @EnableWebMvc
  @Import(ProviderTestController.class)
  static class WebConfig {}

  @Test
  void defaultProfileDoesNotExposeTestRoutes() {
    runner.run(context -> {
      assertThat(context).doesNotHaveBean(ProviderTestController.class);
      var mvc = MockMvcBuilders.webAppContextSetup(context).build();
      mvc.perform(get("/api/test/zhihu/search").param("query", "test")).andExpect(status().isNotFound());
      mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/test/ai")
          .contentType("application/json").content("{\"prompt\":\"test\"}")).andExpect(status().isNotFound());
    });
  }

  @Test
  void localTestProfileRegistersController() {
    runner.withPropertyValues("spring.profiles.active=local-test").run(context ->
        assertThat(context).hasSingleBean(ProviderTestController.class));
  }
}
