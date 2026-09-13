package com.zhihu.hackathon.auth;

import java.time.Clock;
import java.util.HashMap;
import java.util.Map;

/** 单实例、按来源隔离的失败窗口；在途预留防止并发请求穿透次数限制。 */
final class AdminLoginAttempts {
  private final Clock clock;
  private final Map<String, Window> windows = new HashMap<>();
  private int running;

  AdminLoginAttempts(Clock clock) { this.clock = clock; }

  synchronized Window acquire(String source) {
    long now = clock.millis();
    windows.values().removeIf(w -> w.running == 0 && expired(w, now));
    Window window = windows.get(source);
    if (window != null && expired(window, now)) {
      window.start = now;
      window.failures = 0;
    }
    if (window != null && window.failures + window.running >= 10) {
      throw new AuthException(429, "LOGIN_RATE_LIMITED", "当前网络登录失败次数过多，请一分钟后重试。");
    }
    // 不排队执行昂贵的密码校验，也不让新来源无限占用内存。
    if (running >= 2 || (window == null && windows.size() >= 4096)) {
      throw new AuthException(429, "LOGIN_BUSY", "登录服务繁忙，请稍后重试。");
    }
    if (window == null) {
      window = new Window(now);
      windows.put(source, window);
    }
    window.running++;
    running++;
    return window;
  }

  synchronized void finish(Window window, boolean invalidCredentials) {
    long now = clock.millis();
    if (expired(window, now)) {
      window.start = now;
      window.failures = 0;
    }
    if (invalidCredentials) window.failures++;
    window.running--;
    running--;
  }

  private boolean expired(Window window, long now) {
    return now < window.start || now - window.start >= 60_000;
  }

  static final class Window {
    private long start;
    private int failures;
    private int running;
    private Window(long start) { this.start = start; }
  }
}
