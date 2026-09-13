package com.zhihu.hackathon.auth;

import java.net.URI;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class ZhihuOAuthConfiguration {
  @Bean
  ZhihuOAuthClient zhihuOAuthClient(@Value("${auth.zhihu.enabled:false}") boolean enabled,
      @Value("${auth.zhihu.app-id:}") String appId,
      @Value("${auth.zhihu.app-key:}") String appKey,
      @Value("${auth.zhihu.redirect-uri:}") String redirectUri) {
    if (enabled) {
      URI redirect = URI.create(redirectUri);
      boolean https = "https".equals(redirect.getScheme());
      boolean localHttp = "http".equals(redirect.getScheme())
          && ("127.0.0.1".equals(redirect.getHost()) || "localhost".equals(redirect.getHost()));
      if (appId.isBlank() || appKey.isBlank() || !(https || localHttp) || redirect.getHost() == null
          || redirect.getRawUserInfo() != null || redirect.getRawQuery() != null || redirect.getFragment() != null
          || !"/api/v1/auth/zhihu/callback".equals(redirect.getPath())) {
        throw new IllegalStateException("Zhihu OAuth requires credentials and a registered callback URL");
      }
    }
    var http = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(java.net.http.HttpClient.Redirect.NEVER).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofSeconds(15));
    return new ZhihuOAuthClient(RestClient.builder().baseUrl("https://openapi.zhihu.com")
        .requestFactory(factory).defaultHeader("User-Agent", "KnowledgeSteps/1.0").build(),
        enabled, appId, appKey, redirectUri);
  }
}
