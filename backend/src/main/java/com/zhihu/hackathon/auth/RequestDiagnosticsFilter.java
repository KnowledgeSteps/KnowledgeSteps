package com.zhihu.hackathon.auth;

import com.zhihu.hackathon.session.TaskDiagnostics;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerMapping;

@Component
public class RequestDiagnosticsFilter extends OncePerRequestFilter {
  private final MeterRegistry meters;
  public RequestDiagnosticsFilter(MeterRegistry meters) { this.meters = meters; }

  @Override protected boolean shouldNotFilter(HttpServletRequest request) {
    return !request.getRequestURI().startsWith("/api/");
  }

  @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    String previous = MDC.get("requestId");
    String id = UUID.randomUUID().toString();
    MDC.put("requestId", id);
    response.setHeader("X-Request-ID", id);
    long started = System.nanoTime();
    boolean failed = false;
    try { chain.doFilter(request, response); }
    catch (ServletException | IOException | RuntimeException error) {
      failed = true;
      LoggerFactory.getLogger(RequestDiagnosticsFilter.class).error("Request aborted requestId={} errorType={}", id, TaskDiagnostics.errorType(error));
      throw error;
    } finally {
      Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
      String route = pattern == null ? "unmapped" : pattern.toString();
      int status = failed ? 500 : response.getStatus();
      meters.timer("learning.http.requests", "route", route, "status", Integer.toString(status))
          .record(System.nanoTime() - started, TimeUnit.NANOSECONDS);
      if (status >= 500) LoggerFactory.getLogger(RequestDiagnosticsFilter.class).warn(
          "Request failed requestId={} route={} status={} elapsedMs={}", id, route, status, (System.nanoTime() - started) / 1_000_000);
      if (previous == null) MDC.remove("requestId"); else MDC.put("requestId", previous);
    }
  }
}
