package com.zhihu.hackathon.auth;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import static org.assertj.core.api.Assertions.*;

class LoginClientAddressTest {
  @Test void directClientsCannotForgeTheirSourceUsingForwardingHeaders() {
    var request = request("192.0.2.1", "198.51.100.1");
    request.addHeader("X-Forwarded-For", "203.0.113.1");
    assertThat(new LoginClientAddress("127.0.0.1,::1").resolve(request)).isEqualTo("192.0.2.1");
  }

  @Test void trustedProxyCanSupplyOneNumericAddressAndCanonicalizesIpv6() {
    var resolver = new LoginClientAddress("127.0.0.1,::1");
    assertThat(resolver.resolve(request("127.0.0.1", "198.51.100.1"))).isEqualTo("198.51.100.1");
    assertThat(resolver.resolve(request("::1", "2001:db8::1")))
        .isEqualTo(resolver.resolve(request("0:0:0:0:0:0:0:1", "2001:0db8:0:0:0:0:0:1")));
  }

  @Test void malformedMultipleAndHostnameHeadersFallBackToSocketPeer() {
    var resolver = new LoginClientAddress("127.0.0.1");
    for (String value : new String[]{"example.com", "1.2.3.999", "1.2.3.4, 5.6.7.8", "::1%eth0", ""}) {
      assertThat(resolver.resolve(request("127.0.0.1", value))).isEqualTo("127.0.0.1");
    }
    var request = request("127.0.0.1", "198.51.100.1");
    request.addHeader("X-Real-IP", "198.51.100.2");
    assertThat(resolver.resolve(request)).isEqualTo("127.0.0.1");
    assertThat(new LoginClientAddress("").resolve(request("127.0.0.1", "198.51.100.1")))
        .isEqualTo("127.0.0.1");
    assertThatThrownBy(() -> new LoginClientAddress("example.com")).isInstanceOf(IllegalArgumentException.class);
  }

  private MockHttpServletRequest request(String peer, String header) {
    var request = new MockHttpServletRequest();
    request.setRemoteAddr(peer);
    request.addHeader("X-Real-IP", header);
    return request;
  }
}
