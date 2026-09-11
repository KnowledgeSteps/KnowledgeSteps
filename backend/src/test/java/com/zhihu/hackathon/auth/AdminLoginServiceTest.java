package com.zhihu.hackathon.auth;

import java.time.Clock;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminLoginServiceTest {
  static final String HASH = "pbkdf2-sha256$600000$MDEyMzQ1Njc4OWFiY2RlZg==$DWi7EvtJ6L+NkY6jt8ML672zLIdY3f7iNVuJJMAARJA=";
  private final AuthUserStore users = mock(AuthUserStore.class);

  @Test void disabledLoginDoesNotCreateUsersOrRequireCredentials() {
    var service = new AdminLoginService(users, false, "admin", "");
    assertThatThrownBy(() -> service.login("admin", "test-admin-password"))
        .isInstanceOfSatisfying(AuthException.class, e -> assertThat(e.code()).isEqualTo("ADMIN_LOGIN_DISABLED"));
    verifyNoInteractions(users);
  }

  @Test void enabledLoginRejectsMissingOrMalformedHashAtStartup() {
    assertThatThrownBy(() -> new AdminLoginService(users, true, "admin", ""))
        .isInstanceOf(IllegalArgumentException.class).hasMessage("Invalid auth.admin.password-hash configuration");
    assertThatThrownBy(() -> new AdminLoginService(users, true, "admin", "secret-value"))
        .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining("secret-value");
  }

  @Test void validPasswordWithWrongUsernameStillFailsWithoutCreatingUser() {
    var service = new AdminLoginService(users, true, "admin", HASH);
    assertInvalid(() -> service.login("other", "test-admin-password"));
    assertInvalid(() -> service.login("admin", "wrong-password"));
    assertInvalid(() -> service.login("admin", "x".repeat(257)));
    verifyNoInteractions(users);
  }

  @Test void validCredentialsResolvePersistentInternalIdentity() {
    when(users.adminUser("admin")).thenReturn(12L);
    var service = new AdminLoginService(users, true, "admin", HASH);
    assertThat(service.login("admin", "test-admin-password")).isEqualTo(12L);
    verify(users).adminUser("admin");
  }

  @Test void rateLimitCannotBeBypassedByChangingUsernameAndResetsAfterWindow() {
    Clock clock = mock(Clock.class);
    when(clock.millis()).thenReturn(0L);
    var service = new AdminLoginService(users, true, "admin", HASH, clock);
    for (int i = 0; i < 10; i++) {
      String name = "wrong" + i;
      assertInvalid(() -> service.login(name, null));
    }
    assertThatThrownBy(() -> service.login("admin", "test-admin-password"))
        .isInstanceOfSatisfying(AuthException.class, e -> assertThat(e.status()).isEqualTo(429));
    verifyNoInteractions(users);
    when(clock.millis()).thenReturn(60_000L);
    when(users.adminUser("admin")).thenReturn(12L);
    assertThat(service.login("admin", "test-admin-password")).isEqualTo(12L);
  }

  private void assertInvalid(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
    assertThatThrownBy(call).isInstanceOfSatisfying(AuthException.class,
        e -> assertThat(e.code()).isEqualTo("INVALID_CREDENTIALS"));
  }
}
