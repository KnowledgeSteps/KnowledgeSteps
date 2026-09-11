package com.zhihu.hackathon.testing;

import com.fasterxml.jackson.databind.JsonNode;
import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** 仅供本地连通性测试，不保存记录，不属于六个业务接口。 */
@RestController
@Profile("local-test")
@RequestMapping("/api/test")
public class ProviderTestController {
  private final ZhihuSearchClient zhihu;
  private final RestClient ai;
  private final String apiKey;
  private final String model;

  @org.springframework.beans.factory.annotation.Autowired
  public ProviderTestController(ZhihuSearchClient zhihu, RestClient.Builder builder,
      @Value("${model.base-url:https://api.siliconflow.cn/v1}") String baseUrl,
      @Value("${model.api-key:}") String apiKey,
      @Value("${model.graph-model:deepseek-ai/DeepSeek-V4-Flash}") String model) {
    this(zhihu, createClient(builder, baseUrl), apiKey, model);
  }

  ProviderTestController(ZhihuSearchClient zhihu, RestClient ai, String apiKey, String model) {
    this.zhihu = zhihu;
    this.ai = ai;
    this.apiKey = apiKey;
    this.model = model;
  }

  private static RestClient createClient(RestClient.Builder builder, String baseUrl) {
    var http = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofSeconds(60));
    return builder.baseUrl(baseUrl).requestFactory(factory).build();
  }

  @GetMapping("/zhihu/search")
  public Map<String, ?> search(@RequestParam String query) {
    checkInput(query, 100);
    return Map.of("resources", zhihu.search(query.strip()));
  }

  @PostMapping("/ai")
  public Map<String, String> generate(@RequestBody Prompt request) {
    checkInput(request.prompt(), 2000);
    if (apiKey.isBlank()) throw new ProviderFailure("AI_NOT_CONFIGURED", 503);
    JsonNode response;
    try {
      response = ai.post().uri("/chat/completions")
          .header("Authorization", "Bearer " + apiKey)
          .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
          .body(Map.of("model", model, "messages", List.of(Map.of("role", "user", "content", request.prompt().strip())),
              "stream", false, "max_tokens", 1024, "enable_thinking", false))
          .retrieve().onStatus(HttpStatusCode::isError, (req, res) -> {
            throw new ProviderFailure("AI_UPSTREAM_HTTP_" + res.getStatusCode().value(), 502);
          }).body(JsonNode.class);
    } catch (RestClientException exception) {
      throw new ProviderFailure("AI_REQUEST_FAILED", 502);
    }
    JsonNode choice = response == null ? null : response.path("choices").path(0);
    if (choice != null && "length".equals(choice.path("finish_reason").asText())) {
      throw new ProviderFailure("AI_OUTPUT_TRUNCATED", 502);
    }
    JsonNode content = choice == null ? null : choice.path("message").path("content");
    if (content == null || !content.isTextual() || content.asText().isBlank()) {
      throw new ProviderFailure("AI_INVALID_RESPONSE", 502);
    }
    return Map.of("model", model, "content", content.asText());
  }

  private static void checkInput(String value, int max) {
    if (value == null || value.isBlank() || value.strip().length() > max) {
      throw new ProviderFailure("INVALID_INPUT", 400);
    }
  }

  @ExceptionHandler(ProviderFailure.class)
  ResponseEntity<?> failure(ProviderFailure error) {
    return ResponseEntity.status(error.status).body(Map.of("error", Map.of("code", error.getMessage())));
  }

  @ExceptionHandler(ZhihuSearchClient.SearchException.class)
  ResponseEntity<?> searchFailure(ZhihuSearchClient.SearchException error) {
    return ResponseEntity.status(error.getMessage().equals("ZHIHU_NOT_CONFIGURED") ? 503 : 502)
        .body(Map.of("error", Map.of("code", error.getMessage())));
  }

  public record Prompt(String prompt) {}

  private static final class ProviderFailure extends RuntimeException {
    private final int status;
    ProviderFailure(String code, int status) { super(code); this.status = status; }
  }
}
