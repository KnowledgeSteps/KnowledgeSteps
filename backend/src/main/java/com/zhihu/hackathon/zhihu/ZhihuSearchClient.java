package com.zhihu.hackathon.zhihu;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;

import org.springframework.http.HttpStatusCode;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** 知乎站内搜索适配器；不记录凭证或上游响应，不自动重试鉴权错误。 */
public final class ZhihuSearchClient {
  private final RestClient client;
  private final String secret;
  private final Clock clock;

  public ZhihuSearchClient(RestClient client, String secret, Clock clock) {
    this.client = client;
    this.secret = secret;
    this.clock = clock;
  }

  public List<Resource> search(String query) {
    if (query == null || query.isBlank()) {
      throw new IllegalArgumentException("搜索词不能为空");
    }
    if (secret == null || secret.isBlank()) {
      throw new SearchException("ZHIHU_NOT_CONFIGURED", false);
    }
    JsonNode response;
    try {
      response = client.get()
          .uri(builder -> builder.path("/api/v1/content/zhihu_search")
              .queryParam("Query", "{query}").queryParam("Count", 3).build(query.strip()))
          .header("Authorization", "Bearer " + secret)
          .header("X-Request-Timestamp", Long.toString(clock.instant().getEpochSecond()))
          .header("Content-Type", "application/json")
          .retrieve()
          .onStatus(HttpStatusCode::isError, (request, result) -> {
            int status = result.getStatusCode().value();
            throw new SearchException(status == 401 || status == 403 ? "ZHIHU_AUTH_FAILED"
                : status == 429 ? "ZHIHU_RATE_LIMITED" : "ZHIHU_HTTP_ERROR",
                status == 429 || status >= 500);
          })
          .body(JsonNode.class);
    } catch (RestClientException exception) {
      throw new SearchException("ZHIHU_REQUEST_FAILED", true);
    }
    if (response == null || !response.path("Code").isIntegralNumber()) {
      throw new SearchException("ZHIHU_INVALID_RESPONSE", false);
    }
    long code = response.path("Code").asLong();
    if (code != 0) {
      throw new SearchException(switch ((int) code) {
        case 10001 -> "ZHIHU_INVALID_QUERY";
        case 20001 -> "ZHIHU_AUTH_FAILED";
        case 30001 -> "ZHIHU_RATE_LIMITED";
        default -> "ZHIHU_UPSTREAM_ERROR";
      }, code == 30001 || code == 90001);
    }
    JsonNode items = response.path("Data").path("Items");
    if (!items.isArray()) {
      throw new SearchException("ZHIHU_INVALID_RESPONSE", false);
    }
    List<Resource> resources = new ArrayList<>();
    for (JsonNode item : items) {
      String title = text(item, "Title");
      String url = text(item, "Url");
      if (title == null || title.isBlank() || url == null || !validUrl(url)) {
        throw new SearchException("ZHIHU_INVALID_RESPONSE", false);
      }
      JsonNode votes = item.path("VoteUpCount");
      Long voteCount = votes.isIntegralNumber() && votes.canConvertToLong() && votes.asLong() >= 0
          ? votes.asLong() : null;
      if (resources.stream().noneMatch(resource -> resource.url().equals(url))) {
        resources.add(new Resource(title, url, text(item, "ContentText"), text(item, "AuthorName"), voteCount));
      }
      if (resources.size() == 3) break;
    }
    return List.copyOf(resources);
  }

  private static String text(JsonNode item, String field) {
    return item.path(field).isTextual() ? item.path(field).textValue() : null;
  }

  private static boolean validUrl(String value) {
    try {
      var uri = java.net.URI.create(value);
      String host = uri.getHost();
      return "https".equalsIgnoreCase(uri.getScheme()) && uri.getUserInfo() == null && host != null
          && (host.equalsIgnoreCase("zhihu.com") || host.toLowerCase(java.util.Locale.ROOT).endsWith(".zhihu.com"));
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }

  public record Resource(String title, String url, String summary, String authorName, Long voteCount) {}

  public static final class SearchException extends RuntimeException {
    private final boolean retryable;

    public SearchException(String code, boolean retryable) {
      super(code);
      this.retryable = retryable;
    }

    public boolean retryable() { return retryable; }
  }
}
