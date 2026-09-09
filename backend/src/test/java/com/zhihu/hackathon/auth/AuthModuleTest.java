package com.zhihu.hackathon.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthModuleTest {
  final AuthUserStore users = mock(AuthUserStore.class);
  final CsrfTokens csrf = new CsrfTokens();
  final SessionAuthentication authentication = new SessionAuthentication(users, csrf);

  @Test void establishingLoginReplacesSessionAndCsrfToken() {
    when(users.isLoginUser(1)).thenReturn(true);
    var request = new MockHttpServletRequest();
    var old = (MockHttpSession) request.getSession();
    String token = csrf.issue(request);
    authentication.establish(request, 1);
    assertThat(old.isInvalid()).isTrue();
    assertThat(request.getSession().getId()).isNotEqualTo(old.getId());
    assertThat(csrf.issue(request)).isNotEqualTo(token);
    assertThat(authentication.currentUserId(request)).isEqualTo(1);
    request.addHeader("X-CSRF-Token", token);
    assertThatThrownBy(() -> csrf.verify(request)).isInstanceOf(AuthException.class);
  }

  @Test void unknownUserCannotEstablishOrReuseSession() {
    var request = new MockHttpServletRequest();
    assertThatThrownBy(() -> authentication.establish(request, 99)).isInstanceOf(AuthException.class);
    assertThat(request.getSession(false)).isNull();
    request.getSession().setAttribute(SessionAuthentication.USER_ID, 99L);
    assertThatThrownBy(() -> authentication.currentUserId(request)).isInstanceOf(AuthException.class);
  }

  @Test void csrfCannotBeReusedAcrossSessions() {
    var one = new MockHttpServletRequest();
    var two = new MockHttpServletRequest();
    csrf.issue(two);
    two.addHeader("X-CSRF-Token", csrf.issue(one));
    assertThatThrownBy(() -> csrf.verify(two)).isInstanceOf(AuthException.class);
  }

  @Test void localUserIsCreatedOnlyOnce() {
    when(users.localUser("developer")).thenReturn(7L);
    var provider = new AuthConfiguration().localUser(users, "developer");
    assertThat(provider.currentUserId()).isEqualTo(7);
    assertThat(provider.currentUserId()).isEqualTo(7);
    verify(users, times(1)).localUser("developer");
  }

  @Test void logoutRequiresCsrfAndInvalidatesLogin() throws Exception {
    when(users.isLoginUser(1)).thenReturn(true);
    var request = new MockHttpServletRequest();
    authentication.establish(request, 1);
    var session = (MockHttpSession) request.getSession();
    String token = csrf.issue(request);
    var controller = new AuthController(() -> authentication.currentUserId(request), csrf, authentication);
    var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new AuthErrorHandler()).build();
    mvc.perform(post("/api/v1/auth/logout").session(session)).andExpect(status().isForbidden());
    assertThat(session.isInvalid()).isFalse();
    mvc.perform(post("/api/v1/auth/logout").session(session).header("X-CSRF-Token", token))
        .andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
    assertThat(session.isInvalid()).isTrue();
    assertThatThrownBy(() -> authentication.currentUserId(new MockHttpServletRequest())).isInstanceOf(AuthException.class);
  }

  @Test void identityResponseCannotBeCached() throws Exception {
    var mvc = MockMvcBuilders.standaloneSetup(new AuthController(() -> 1L, csrf, authentication)).build();
    mvc.perform(get("/api/v1/auth/me")).andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.csrfToken").isString());
  }
}
