package com.zhihu.hackathon.auth;

import java.time.Clock;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AdminLoginAttemptsTest {
  private final Clock clock = mock(Clock.class);
  private final AdminLoginAttempts attempts = new AdminLoginAttempts(clock);

  @Test void failureWindowIsPerSourceAndSuccessDoesNotConsumeBudget() {
    for (int i = 0; i < 20; i++) attempts.finish(attempts.acquire("successful"), false);
    for (int i = 0; i < 10; i++) attempts.finish(attempts.acquire("attacker"), true);
    assertCode("attacker", "LOGIN_RATE_LIMITED");
    attempts.finish(attempts.acquire("legitimate"), false);
    when(clock.millis()).thenReturn(60_000L);
    attempts.finish(attempts.acquire("attacker"), false);
  }

  @Test void globalConcurrencyHasNoQueueAndRejectedRequestsDoNotConsumeAttempts() {
    var first = attempts.acquire("one");
    var second = attempts.acquire("two");
    for (int i = 0; i < 20; i++) assertCode("three", "LOGIN_BUSY");
    attempts.finish(first, false);
    attempts.finish(attempts.acquire("three"), false);
    attempts.finish(second, false);
  }

  @Test void concurrentRequestsReserveRemainingFailureBudget() {
    for (int i = 0; i < 9; i++) attempts.finish(attempts.acquire("one"), true);
    var last = attempts.acquire("one");
    assertCode("one", "LOGIN_RATE_LIMITED");
    attempts.finish(last, true);
    assertCode("one", "LOGIN_RATE_LIMITED");
  }

  @Test void sourceStorageIsBoundedWithoutEvictingActiveRateLimits() {
    for (int i = 0; i < 4096; i++) attempts.finish(attempts.acquire("ip-" + i), true);
    assertCode("new-source", "LOGIN_BUSY");
    attempts.finish(attempts.acquire("ip-0"), false);
    when(clock.millis()).thenReturn(60_000L);
    attempts.finish(attempts.acquire("new-source"), false);
  }

  @Test void clockRollbackRecoversWindowWithoutLosingRunningReservations() {
    when(clock.millis()).thenReturn(60_000L);
    var running = attempts.acquire("one");
    when(clock.millis()).thenReturn(0L);
    var second = attempts.acquire("one");
    assertCode("two", "LOGIN_BUSY");
    attempts.finish(running, true);
    attempts.finish(second, true);
    attempts.finish(attempts.acquire("two"), false);
  }

  private void assertCode(String source, String code) {
    assertThatThrownBy(() -> attempts.acquire(source)).isInstanceOfSatisfying(AuthException.class,
        e -> assertThat(e.code()).isEqualTo(code));
  }
}
