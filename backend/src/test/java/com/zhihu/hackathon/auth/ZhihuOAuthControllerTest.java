package com.zhihu.hackathon.auth;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ZhihuOAuthControllerTest {
  final ZhihuOAuthClient client = mock(ZhihuOAuthClient.class);
  final AuthUserStore users = mock(AuthUserStore.class);
  final MutableClock clock = new MutableClock();
  final CsrfTokens csrf = new CsrfTokens();
  MockMvc mvc;

  @BeforeEach void setup() {
    when(client.enabled()).thenReturn(true);
    when(client.authorizationUri(anyString())).thenAnswer(call ->
        URI.create("https://openapi.zhihu.com/authorize?state=" + call.getArgument(0)));
    when(client.authenticate(anyString())).thenReturn(new ZhihuOAuthClient.Identity("1234567", "知乎读者", ""));
    when(users.zhihuUser("1234567", "知乎读者", "")).thenReturn(7L);
    when(users.isLoginUser(7L)).thenReturn(true);
    mvc = MockMvcBuilders.standaloneSetup(new ZhihuOAuthController(client, users,
        new SessionAuthentication(users, csrf), clock)).build();
  }

  @Test void startUsesFreshUnpredictableStateAndDoesNotExposeSecrets() throws Exception {
    var first = start("/history");
    var second = start("/history");
    assertThat(first.state()).matches("[A-Za-z0-9_-]{43}").isNotEqualTo(second.state());
    assertThat(first.session().getAttribute(SessionAuthentication.USER_ID)).isNull();
    verify(client, never()).authenticate(anyString());
  }

  @Test void callbackWithoutStartedFlowDoesNotExchangeCode() throws Exception {
    var response = mvc.perform(get("/api/v1/auth/zhihu/callback")
        .param("authorization_code", "code").param("state", "unsolicited"))
        .andExpect(status().isSeeOther()).andReturn();
    assertFailure(response, "OAUTH_STATE_INVALID", "/");
    assertThat(response.getRequest().getSession(false)).isNull();
    verify(client, never()).authenticate(anyString());
    verifyNoInteractions(users);
  }

  @ParameterizedTest
  @NullAndEmptySource
  @ValueSource(strings = {"wrong-state"})
  void absentOrWrongStateCannotExchangeCodeAndConsumesAttempt(String invalidState) throws Exception {
    var flow = start("/history");
    var callback = get("/api/v1/auth/zhihu/callback").session(flow.session()).param("authorization_code", "code");
    if (invalidState != null) callback.param("state", invalidState);
    assertFailure(mvc.perform(callback).andExpect(status().isSeeOther()).andReturn(), "OAUTH_STATE_INVALID", "/history");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("authorization_code", "code").param("state", flow.state())).andReturn(), "OAUTH_STATE_INVALID", "/");
    verify(client, never()).authenticate(anyString());
    verifyNoInteractions(users);
  }

  @Test void stateCannotBeReusedFromAnotherBrowserSession() throws Exception {
    var first = start("/history");
    var second = start("/");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(second.session())
        .param("authorization_code", "code").param("state", first.state())).andReturn(), "OAUTH_STATE_INVALID", "/");
    verify(client, never()).authenticate(anyString());
  }

  @Test void stateExpiresAtTenMinutesWithoutExchangingCode() throws Exception {
    var flow = start("/history");
    clock.advanceSeconds(600);
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("authorization_code", "code").param("state", flow.state())).andReturn(), "OAUTH_STATE_INVALID", "/history");
    verify(client, never()).authenticate(anyString());
    verifyNoInteractions(users);
  }

  @Test void successfulCallbackWithinLifetimeCannotBeReplayedInNewSession() throws Exception {
    var flow = start("/sessions/123/questions");
    clock.advanceSeconds(599);
    var response = mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("authorization_code", "once").param("state", flow.state()))
        .andExpect(status().isSeeOther()).andExpect(redirectedUrl("/sessions/123/questions")).andReturn();
    var loggedIn = (MockHttpSession) response.getRequest().getSession(false);
    assertThat(flow.session().isInvalid()).isTrue();
    assertThat(loggedIn.getAttribute(SessionAuthentication.USER_ID)).isEqualTo(7L);
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(loggedIn)
        .param("authorization_code", "once").param("state", flow.state())).andReturn(), "OAUTH_STATE_INVALID", "/");
    verify(client, times(1)).authenticate("once");
    verify(users, times(1)).zhihuUser("1234567", "知乎读者", "");
  }

  @Test void cancellationDoesNotAuthenticateAndCannotBeRetriedWithSameState() throws Exception {
    var flow = start("/history");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state", flow.state()).param("error", "access_denied").param("authorization_code", "code"))
        .andReturn(), "OAUTH_CANCELLED", "/history");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state", flow.state()).param("authorization_code", "code")).andReturn(), "OAUTH_STATE_INVALID", "/");
    assertThat(flow.session().getAttribute(SessionAuthentication.USER_ID)).isNull();
    verify(client, never()).authenticate(anyString());
  }

  @Test void concurrentCallbacksConsumeStateOnceBeforeProviderExchangeFinishes() throws Exception {
    var flow = start("/history");
    var entered = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    when(client.authenticate("concurrent-code")).thenAnswer(call -> {
      entered.countDown();
      assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
      return new ZhihuOAuthClient.Identity("1234567", "知乎读者", "");
    });
    try (var executor = Executors.newSingleThreadExecutor()) {
      var first = executor.submit(() -> mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
          .param("state", flow.state()).param("authorization_code", "concurrent-code")).andReturn());
      try {
        assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
        assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
            .param("state", flow.state()).param("authorization_code", "concurrent-code"))
            .andReturn(), "OAUTH_STATE_INVALID", "/");
      } finally {
        release.countDown();
      }
      assertThat(first.get(5, TimeUnit.SECONDS).getResponse().getRedirectedUrl()).isEqualTo("/history");
    }
    verify(client, times(1)).authenticate("concurrent-code");
    verify(users, times(1)).zhihuUser("1234567", "知乎读者", "");
  }

  @Test void providerFailureDoesNotEstablishLoginOrLeakErrorDetails() throws Exception {
    when(client.authenticate("failed-grant")).thenThrow(new IllegalStateException("secret-token provider body"));
    var flow = start("/history");
    var result = mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state", flow.state()).param("authorization_code", "failed-grant")).andReturn();
    assertFailure(result, "OAUTH_FAILED", "/history");
    assertThat(result.getResponse().getContentAsString()).doesNotContain("secret-token");
    assertThat(result.getResponse().getRedirectedUrl()).doesNotContain("secret-token", "failed-grant");
    assertThat(flow.session().getAttribute(SessionAuthentication.USER_ID)).isNull();
    verifyNoInteractions(users);
  }

  @Test void invalidatingSessionDuringProviderExchangeCannotRestoreLogin() throws Exception {
    var flow = start("/history");
    when(client.authenticate("late-code")).thenAnswer(call -> {
      flow.session().invalidate();
      return new ZhihuOAuthClient.Identity("1234567", "知乎读者", "");
    });
    var result = mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state", flow.state()).param("authorization_code", "late-code")).andReturn();
    assertFailure(result, "OAUTH_FAILED", "/history");
    assertThat(flow.session().isInvalid()).isTrue();
    assertThat(result.getRequest().getSession(false)).isNull();
    verifyNoInteractions(users);
  }

  @Test void restartingAuthorizationDuringExchangePreventsOlderFlowFromLoggingIn() throws Exception {
    var first = start("/history");
    var currentState = new AtomicReference<String>();
    when(client.authenticate("old-flow-code")).thenAnswer(call -> {
      var restarted = mvc.perform(get("/api/v1/auth/zhihu/start").session(first.session())
          .param("returnTo", "/sessions/9/result")).andExpect(status().isSeeOther()).andReturn();
      currentState.set(UriComponentsBuilder.fromUriString(restarted.getResponse().getRedirectedUrl())
          .build().getQueryParams().getFirst("state"));
      return new ZhihuOAuthClient.Identity("1234567", "知乎读者", "");
    });
    var response = mvc.perform(get("/api/v1/auth/zhihu/callback").session(first.session())
        .param("state", first.state()).param("authorization_code", "old-flow-code")).andReturn();
    assertFailure(response, "OAUTH_STATE_INVALID", "/history");
    assertThat(first.session().getAttribute(SessionAuthentication.USER_ID)).isNull();
    verifyNoInteractions(users);
    assertThat(currentState.get()).isNotBlank().isNotEqualTo(first.state());
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(first.session())
        .param("state", currentState.get()).param("authorization_code", "new-flow-code"))
        .andExpect(redirectedUrl("/sessions/9/result"));
    verify(users, times(1)).zhihuUser("1234567", "知乎读者", "");
  }

  @Test void standardCodeIsSupportedButDocumentedAuthorizationCodeTakesPrecedence() throws Exception {
    var standard = start("/");
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(standard.session())
        .param("state", standard.state()).param("code", "standard-code"))
        .andExpect(redirectedUrl("/"));
    var both = start("/");
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(both.session())
        .param("state", both.state()).param("authorization_code", "primary-code").param("code", "ignored-code"))
        .andExpect(redirectedUrl("/"));
    verify(client).authenticate("standard-code");
    verify(client).authenticate("primary-code");
    verify(client, never()).authenticate("ignored-code");
  }

  @Test void missingOrBlankPrimaryCodeDoesNotFallBackToAnotherGrant() throws Exception {
    var missing = start("/");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(missing.session())
        .param("state", missing.state())).andReturn(), "OAUTH_FAILED", "/");
    var blank = start("/");
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").session(blank.session())
        .param("state", blank.state()).param("authorization_code", " ").param("code", "other-code"))
        .andReturn(), "OAUTH_FAILED", "/");
    verify(client, never()).authenticate(anyString());
  }

  @ParameterizedTest
  @ValueSource(strings = {"https://attacker.test", "//attacker.test", "/\\attacker.test", "/history?next=evil",
      "/sessions/1/result#redirect", "/api/v1/auth/logout", "/sessions/0/questions", "/doubts?next=evil"})
  void returnToCannotRedirectOutsideAllowedPagePaths(String destination) throws Exception {
    var flow = start(destination);
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state", flow.state()).param("authorization_code", "code"))
        .andExpect(redirectedUrl("/"));
  }

  @Test void returnsToDoubtsAfterOAuthLogin() throws Exception {
    var flow=start("/doubts");
    mvc.perform(get("/api/v1/auth/zhihu/callback").session(flow.session())
        .param("state",flow.state()).param("authorization_code","code"))
        .andExpect(redirectedUrl("/doubts"));
  }

  @Test void disabledProviderDoesNotCreatePendingSessionOrExchangeCode() throws Exception {
    when(client.enabled()).thenReturn(false);
    var result = mvc.perform(get("/api/v1/auth/zhihu/start").param("returnTo", "/history")).andReturn();
    assertFailure(result, "OAUTH_UNAVAILABLE", "/history");
    assertThat(result.getRequest().getSession(false)).isNull();
    assertFailure(mvc.perform(get("/api/v1/auth/zhihu/callback").param("state", "anything")
        .param("authorization_code", "anything")).andReturn(), "OAUTH_UNAVAILABLE", "/");
    verify(client, never()).authorizationUri(anyString());
    verify(client, never()).authenticate(anyString());
  }

  private Flow start(String returnTo) throws Exception {
    var result = mvc.perform(get("/api/v1/auth/zhihu/start").param("returnTo", returnTo))
        .andExpect(status().isSeeOther()).andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(header().string("Referrer-Policy", "no-referrer")).andReturn();
    String state = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl())
        .build().getQueryParams().getFirst("state");
    return new Flow((MockHttpSession) result.getRequest().getSession(false), state);
  }

  private void assertFailure(MvcResult result, String error, String destination) {
    assertThat(result.getResponse().getStatus()).isEqualTo(303);
    assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
    var url = UriComponentsBuilder.fromUriString(result.getResponse().getRedirectedUrl()).build();
    assertThat(url.getPath()).isEqualTo("/login");
    assertThat(url.getQueryParams().getFirst("oauthError")).isEqualTo(error);
    assertThat(url.getQueryParams().getFirst("returnTo")).isEqualTo(destination);
  }
  private record Flow(MockHttpSession session, String state) {}
  private static class MutableClock extends Clock {
    Instant current = Instant.parse("2026-09-13T00:00:00Z");
    void advanceSeconds(long seconds) { current = current.plusSeconds(seconds); }
    @Override public ZoneId getZone() { return ZoneOffset.UTC; }
    @Override public Clock withZone(ZoneId zone) { return this; }
    @Override public Instant instant() { return current; }
  }
}
