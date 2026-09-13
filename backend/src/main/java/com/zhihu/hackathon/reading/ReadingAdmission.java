package com.zhihu.hackathon.reading;

import com.zhihu.hackathon.session.SessionException;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/** 固定内存容量；网络等待不占数据库事务，拒绝排队而非无限创建线程。 */
@Component
public class ReadingAdmission {
  private record Window(long started, int count) {}
  private final Map<Long, Window> windows = new HashMap<>();
  private final java.util.Set<Long> running = new java.util.HashSet<>();

  public <T> T execute(long user, Supplier<T> work) {
    synchronized (this) {
      long now = System.currentTimeMillis();
      windows.entrySet().removeIf(entry -> now - entry.getValue().started() >= 60_000);
      var window = windows.get(user);
      if (running.contains(user)) throw limited("上一项阅读解释仍在生成，请稍后再试。", 5);
      if (running.size() >= 2) throw limited("阅读助手当前繁忙，请稍后重试。", 5);
      if (window != null && window.count() >= 6)
        throw limited("每分钟最多请求 6 次阅读讲解，请稍后再试。", (int)Math.max(1, (60_000 - now + window.started() + 999) / 1000));
      if (window == null && windows.size() >= 1024) throw limited("阅读助手当前繁忙，请稍后重试。", 60);
      windows.put(user, new Window(window == null ? now : window.started(), window == null ? 1 : window.count() + 1));
      running.add(user);
    }
    try { return work.get(); }
    finally { synchronized (this) { running.remove(user); } }
  }
  private SessionException limited(String message, int retry) {
    return new SessionException(429, "READING_RATE_LIMITED", message, retry);
  }
}
