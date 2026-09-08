package com.zhihu.hackathon.zhihu;

import java.time.Clock;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class ZhihuSearchConfiguration {
  @Bean
  ZhihuSearchClient zhihuSearchClient(@Value("${zhihu.access-secret:}") String secret) {
    var http = java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
        .followRedirects(java.net.http.HttpClient.Redirect.NEVER).build();
    var factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(Duration.ofSeconds(15));
    return new ZhihuSearchClient(RestClient.builder().baseUrl("https://developer.zhihu.com")
        .requestFactory(factory).build(), secret, Clock.systemUTC());
  }
}
