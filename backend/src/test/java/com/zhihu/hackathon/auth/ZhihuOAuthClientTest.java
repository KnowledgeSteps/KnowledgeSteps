package com.zhihu.hackathon.auth;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ZhihuOAuthClientTest {
  private final RestClient.Builder builder = RestClient.builder().baseUrl("https://openapi.zhihu.com");
  private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
  private final ZhihuOAuthClient client = new ZhihuOAuthClient(builder.build(), true, "459", "unit-test-app-key",
      "https://ksteps.yinbo.online/api/v1/auth/zhihu/callback");

  @Test void exchangesFormAndUsesOnlyOAuthBearerForProfileWithoutLosingLongId() {
    server.expect(requestTo("https://openapi.zhihu.com/access_token")).andExpect(method(HttpMethod.POST))
        .andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
        .andExpect(content().string(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("app_key=unit-test-app-key"),
            org.hamcrest.Matchers.containsString("code=one-time-code"),
            org.hamcrest.Matchers.containsString("grant_type=authorization_code"))))
        .andRespond(withSuccess("{\"code\":20000,\"data\":{\"access_token\":\"unit-token\",\"expires_in\":3600}}", MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://openapi.zhihu.com/user")).andExpect(method(HttpMethod.GET))
        .andExpect(header("Authorization", "Bearer unit-token"))
        .andExpect(headerDoesNotExist("X-OAuth-Token"))
        .andRespond(withSuccess("""
            {"uid":969570047710216200,"fullname":"知乎用户","avatar_path":"https://picx.zhimg.com/avatar.jpg",
             "email":"not-stored@example.com","phone_no":"not-stored"}
            """, MediaType.APPLICATION_JSON));
    var identity = client.authenticate("one-time-code");
    assertThat(identity.id()).isEqualTo("969570047710216200");
    assertThat(identity.nickname()).isEqualTo("知乎用户");
    assertThat(identity.avatarUrl()).isEqualTo("https://picx.zhimg.com/avatar.jpg");
    assertThat(identity.toString()).doesNotContain("unit-token", "not-stored", "unit-test-app-key");
    server.verify();
  }

  @Test void authorizationUrlContainsStateAndRegisteredCallbackButNoSecret() {
    String url = URLDecoder.decode(client.authorizationUri("random-state").toString(), StandardCharsets.UTF_8);
    assertThat(url).startsWith("https://openapi.zhihu.com/authorize?")
        .contains("state=random-state", "response_type=code", "app_id=459",
            "redirect_uri=https://ksteps.yinbo.online/api/v1/auth/zhihu/callback")
        .doesNotContain("unit-test-app-key", "app_key");
  }

  @ParameterizedTest
  @ValueSource(strings = {"{}", "{\"code\":404,\"data\":\"User don't exist\"}",
      "{\"uid\":0}", "{\"uid\":1.5}", "{\"uid\":\"admin:admin\"}",
      "{\"uid\":9223372036854775808}", "{\"fullname\":\"管理员\",\"hash_id\":\"aabb\"}"})
  void rejectsProfilesWithoutStablePositiveInt64Uid(String profile) {
    token();
    server.expect(requestTo("https://openapi.zhihu.com/user")).andRespond(withSuccess(profile, MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> client.authenticate("test-code")).isInstanceOf(IllegalStateException.class)
        .hasMessage("Zhihu OAuth failed").hasNoCause();
    server.verify();
  }

  @Test void defaultsOptionalProfileFieldsAndRemovesUnsafeAvatar() {
    token();
    server.expect(requestTo("https://openapi.zhihu.com/user")).andRespond(withSuccess(
        "{\"code\":20000,\"data\":{\"uid\":\"42\",\"avatar_path\":\"javascript:alert(1)\"}}", MediaType.APPLICATION_JSON));
    var identity = client.authenticate("code");
    assertThat(identity).isEqualTo(new ZhihuOAuthClient.Identity("42", "知乎用户", ""));
    server.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {"{\"access_token\":\"secret\"}",
      "{\"access_token\":\"secret\",\"expires_in\":0}", "{\"code\":20004,\"data\":\"secret failure\"}"})
  void rejectsInvalidTokenWithoutRequestingProfile(String body) {
    server.expect(requestTo("https://openapi.zhihu.com/access_token")).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> client.authenticate("private-code")).hasMessage("Zhihu OAuth failed").hasNoCause();
    server.verify();
  }

  @Test void neverExposesOrRetriesUpstreamFailures() {
    server.expect(requestTo("https://openapi.zhihu.com/access_token"))
        .andRespond(withStatus(HttpStatus.BAD_REQUEST).body("private token and key"));
    assertThatThrownBy(() -> client.authenticate("private-code")).hasMessage("Zhihu OAuth failed").hasNoCause();
    server.verify();
  }

  private void token() {
    server.expect(requestTo("https://openapi.zhihu.com/access_token"))
        .andRespond(withSuccess("{\"access_token\":\"unit-token\",\"expires_in\":3600}", MediaType.APPLICATION_JSON));
  }
}
