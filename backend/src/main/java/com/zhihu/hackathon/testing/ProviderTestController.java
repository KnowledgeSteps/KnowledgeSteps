package com.zhihu.hackathon.testing;

import com.fasterxml.jackson.databind.JsonNode;
import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import com.zhihu.hackathon.session.ModelSettings;
import com.zhihu.hackathon.session.ModelRequest;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
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
  private final ModelSettings settings;

  @org.springframework.beans.factory.annotation.Autowired
  public ProviderTestController(ZhihuSearchClient zhihu,
      @org.springframework.beans.factory.annotation.Qualifier("modelRestClient") RestClient ai, ModelSettings settings) {
    this.zhihu=zhihu;this.ai=ai;this.apiKey=settings.apiKey();this.settings=settings;
  }

  ProviderTestController(ZhihuSearchClient zhihu, RestClient ai, String apiKey, String model) {
    this(zhihu, ai, new ModelSettings("", apiKey, model, model));
  }

  @GetMapping("/zhihu/search")
  public Map<String, ?> search(@RequestParam String query) {
    checkInput(query, 100);
    return Map.of("resources", zhihu.search(query.strip()));
  }

  @PostMapping("/ai")
  public Map<String, String> generate(@RequestBody Prompt request) {
    checkInput(request.prompt(), 2000);
    if (request.stage() != null && !List.of("graph", "questions").contains(request.stage()))
      throw new ProviderFailure("INVALID_INPUT", 400);
    boolean graph = !"questions".equals(request.stage());
    String model = graph ? settings.graphModel() : settings.questionModel();
    if (apiKey.isBlank()) throw new ProviderFailure("AI_NOT_CONFIGURED", 503);
    JsonNode response;
    try {
      response = ai.post().uri("/chat/completions")
          .header("Authorization", "Bearer " + apiKey)
          .header("User-Agent", "KnowledgeSteps/1.0")
          .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
          .body(ModelRequest.body(model, List.of(
              Map.of("role", "system", "content", "Return a compact JSON object with an answer field."),
              Map.of("role", "user", "content", request.prompt().strip())), graph, 1024))
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

  public record Prompt(String prompt, String stage) {}

  private static final class ProviderFailure extends RuntimeException {
    private final int status;
    ProviderFailure(String code, int status) { super(code); this.status = status; }
  }
}
