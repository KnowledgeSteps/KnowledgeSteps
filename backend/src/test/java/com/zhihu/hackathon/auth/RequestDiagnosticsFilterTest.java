package com.zhihu.hackathon.auth;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.slf4j.MDC;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.HandlerMapping;
import static org.assertj.core.api.Assertions.*;

@ExtendWith(OutputCaptureExtension.class)
class RequestDiagnosticsFilterTest {
  @Test void ignoresUntrustedRequestIdsAndNeverLogsOAuthQuery(CapturedOutput output) throws Exception {
    var registry = new SimpleMeterRegistry();
    var request = new MockHttpServletRequest("GET", "/api/v1/auth/zhihu/callback");
    request.setQueryString("authorization_code=SECRET-code");
    request.addHeader("X-Request-ID", "SECRET-header");
    request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "/api/v1/auth/zhihu/callback");
    var response = new MockHttpServletResponse();
    new RequestDiagnosticsFilter(registry).doFilter(request, response, (req, res) -> {
      assertThat(MDC.get("requestId")).isEqualTo(response.getHeader("X-Request-ID"));
      response.setStatus(500);
    });
    assertThat(response.getHeader("X-Request-ID")).matches("[a-f0-9-]{36}");
    assertThat(MDC.get("requestId")).isNull();
    assertThat(output.getAll()).contains("status=500").doesNotContain("SECRET-code", "SECRET-header", "authorization_code");
    assertThat(registry.get("learning.http.requests").tags("route", "/api/v1/auth/zhihu/callback", "status", "500").timer().count()).isEqualTo(1);
  }
}
