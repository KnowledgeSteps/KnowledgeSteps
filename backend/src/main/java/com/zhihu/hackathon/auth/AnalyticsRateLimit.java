package com.zhihu.hackathon.auth;

import java.util.HashMap;
import java.util.Map;

/** Cheap, bounded admission before any database write. Single-instance deployment. */
final class AnalyticsRateLimit {
  private long minute = Long.MIN_VALUE;
  private int total;
  private final Map<String,Integer> counts = new HashMap<>();
  synchronized boolean allow(String source, long now) {
    long current = Math.floorDiv(now, 60_000);
    if (minute != current) { minute=current; total=0; counts.clear(); }
    int count = counts.getOrDefault(source, 0);
    if (total >= 300 || count >= 60) return false;
    total++; counts.put(source, count+1); return true;
  }
}
