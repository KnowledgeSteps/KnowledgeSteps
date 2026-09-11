package com.zhihu.hackathon.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AuthConfigurationTest {
  private final AuthUserStore users = mock(AuthUserStore.class);
  private final ApplicationContextRunner context = new ApplicationContextRunner()
      .withUserConfiguration(AuthConfiguration.class)
      .withBean(AuthUserStore.class, () -> users)
      .withBean(CsrfTokens.class, CsrfTokens::new)
      .withBean(SessionAuthentication.class);

  @Test void defaultProfileRequiresLoginAndHasOneProvider() {
    context.run(application -> {
      assertThat(application).hasSingleBean(CurrentUserProvider.class);
      assertThatThrownBy(() -> application.getBean(CurrentUserProvider.class).currentUserId())
          .isInstanceOf(AuthException.class);
      verifyNoInteractions(users);
    });
  }

  @Test void localTestProfileUsesFixedIdentityAndHasOneProvider() {
    when(users.localUser("developer")).thenReturn(7L);
    context.withPropertyValues("spring.profiles.active=local-test").run(application -> {
      assertThat(application).hasSingleBean(CurrentUserProvider.class);
      assertThat(application.getBean(CurrentUserProvider.class).currentUserId()).isEqualTo(7);
      verify(users).localUser("developer");
    });
  }

  @Test void adminLoginCannotBeCombinedWithAutomaticLocalIdentity() {
    context.withPropertyValues("spring.profiles.active=local-test", "auth.admin.enabled=true")
        .run(application -> assertThat(application).hasFailed());
  }

  @ParameterizedTest
  @ValueSource(strings = {"admin-local", "admin-login"})
  void disablingAdminLoginCannotEnableLocalIdentityBypass(String adminProfile) {
    context.withPropertyValues("spring.profiles.active=local-test," + adminProfile, "auth.admin.enabled=false")
        .run(application -> assertThat(application).hasFailed());
  }
}
