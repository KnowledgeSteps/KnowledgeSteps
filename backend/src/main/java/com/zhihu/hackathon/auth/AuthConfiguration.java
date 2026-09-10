package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

@Configuration
public class AuthConfiguration {
  @Bean
  CurrentUserProvider currentUserProvider(Environment environment,
      ObjectProvider<HttpServletRequest> requests, SessionAuthentication sessions,
      AuthUserStore users, @Value("${learning.local-user:developer}") String name) {
    if (environment.acceptsProfiles(Profiles.of("local-test"))) {
      return localUser(users, name);
    }
    return () -> sessions.currentUserId(requests.getIfAvailable());
  }
  CurrentUserProvider localUser(AuthUserStore users, String name) {
    if (name.isBlank() || name.length() > 100) throw new IllegalArgumentException("Invalid learning.local-user");
    // 每个服务实例仅初始化一次；请求参数不能切换身份。
    return new CurrentUserProvider() {
      private Long userId;
      @Override public synchronized long currentUserId() {
        if (userId == null) userId = users.localUser(name);
        return userId;
      }
    };
  }
}
