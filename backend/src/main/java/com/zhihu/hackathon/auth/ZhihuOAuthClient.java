package com.zhihu.hackathon.auth;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/** 仅用于登录：令牌在读取基础资料后丢弃，不读取关注、收藏或联系方式。 */
public final class ZhihuOAuthClient {
  public record Identity(String id, String nickname, String avatarUrl) {}
  private final RestClient http;
  private final boolean enabled;
  private final String appId;
  private final String appKey;
  private final String redirectUri;

  public ZhihuOAuthClient(RestClient http, boolean enabled, String appId, String appKey, String redirectUri) {
    this.http = http; this.enabled = enabled; this.appId = appId; this.appKey = appKey; this.redirectUri = redirectUri;
  }
  public boolean enabled() { return enabled; }
  public URI authorizationUri(String state) {
    return UriComponentsBuilder.fromUriString("https://openapi.zhihu.com/authorize")
        .queryParam("app_id", appId).queryParam("redirect_uri", redirectUri)
        .queryParam("response_type", "code").queryParam("state", state).build().encode().toUri();
  }
  public Identity authenticate(String code) {
    if (!enabled) throw new IllegalStateException("OAuth is unavailable");
    try {
      var form = new LinkedMultiValueMap<String, String>();
      form.add("app_id", appId); form.add("app_key", appKey);
      form.add("grant_type", "authorization_code"); form.add("redirect_uri", redirectUri); form.add("code", code);
      JsonNode response = http.post().uri("/access_token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
          .body(form).retrieve().onStatus(status -> !status.is2xxSuccessful(), (request, result) -> { throw failed(); })
          .body(JsonNode.class);
      JsonNode token = objectWith(response, "access_token");
      String accessToken = text(token, "access_token");
      long expiry = token == null ? 0 : token.path("expires_in").asLong(0);
      if (accessToken.isBlank() || accessToken.length() > 8192 || accessToken.contains("\r")
          || accessToken.contains("\n") || expiry <= 0) throw failed();

      // /user 的 Bearer 是该用户的 OAuth token，不是开放平台 Access Secret。
      JsonNode profileResponse = http.get().uri("/user").header("Authorization", "Bearer " + accessToken)
          .retrieve().onStatus(status -> !status.is2xxSuccessful(), (request, result) -> { throw failed(); })
          .body(JsonNode.class);
      JsonNode profile = objectWith(profileResponse, "uid");
      JsonNode uid = profile == null ? null : profile.get("uid");
      // 稳定采用 uid 绑定，避免昵称变化、缺失字段或不同类型标识导致账号误合并。
      String id = uid != null && (uid.isIntegralNumber() || uid.isTextual()) ? uid.asText() : "";
      if (!id.matches("[1-9][0-9]{0,18}")) throw failed();
      try { if (Long.parseLong(id) <= 0) throw failed(); } catch (NumberFormatException exception) { throw failed(); }
      String name = text(profile, "fullname").strip();
      if (name.isBlank()) name = "知乎用户";
      if (name.length() > 100) name = name.substring(0, 100);
      String avatar = text(profile, "avatar_path");
      if (!safeAvatar(avatar)) avatar = "";
      return new Identity(id, name, avatar);
    } catch (RuntimeException exception) {
      // 重新构造安全异常，不保留可能含密钥、授权码、响应正文的 cause。
      throw failed();
    }
  }

  private static JsonNode objectWith(JsonNode root, String field) {
    if (root == null || !root.isObject()) return null;
    if (root.has(field)) return root;
    for (String wrapper : new String[] {"data", "Data", "user"}) {
      JsonNode value = root.path(wrapper);
      if (value.isObject() && value.has(field)) return value;
    }
    return null;
  }
  private static String text(JsonNode node, String field) {
    return node != null && node.path(field).isTextual() ? node.path(field).asText() : "";
  }
  private static boolean safeAvatar(String value) {
    if (value.length() > 2048) return false;
    try {
      URI uri = URI.create(value);
      return "https".equals(uri.getScheme()) && uri.getHost() != null && uri.getRawUserInfo() == null;
    } catch (IllegalArgumentException exception) { return false; }
  }
  private static IllegalStateException failed() { return new IllegalStateException("Zhihu OAuth failed"); }
}
