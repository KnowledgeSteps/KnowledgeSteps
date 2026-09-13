package com.zhihu.hackathon.auth;

import java.time.Instant;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

@Configuration
@EnableScheduling
public class AnalyticsMaintenance {
  private final VisitorAnalytics analytics;
  public AnalyticsMaintenance(VisitorAnalytics analytics) { this.analytics=analytics; }
  @Scheduled(initialDelay=60_000, fixedDelay=3_600_000)
  public void prune() { analytics.prune(Instant.now()); }
}
