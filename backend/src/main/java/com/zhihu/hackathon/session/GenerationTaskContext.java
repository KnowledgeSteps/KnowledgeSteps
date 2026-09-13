package com.zhihu.hackathon.session;

import java.util.concurrent.CancellationException;

/** 请求边界的协作式取消，供应商清除线程中断标志时仍保留取消状态。 */
public final class GenerationTaskContext {
  private static final ThreadLocal<GenerationTaskContext> CURRENT = new ThreadLocal<>();
  private volatile boolean cancelled;
  private final long started = System.nanoTime();
  private final long timeoutNanos;
  private volatile boolean expired;

  GenerationTaskContext() { this(java.time.Duration.ofNanos(Long.MAX_VALUE)); }
  GenerationTaskContext(java.time.Duration timeout) { timeoutNanos = timeout.toNanos(); }
  void expire() { expired = true; }
  boolean timedOut() { return expired || System.nanoTime() - started >= timeoutNanos; }

  void cancel() { cancelled = true; }
  void install() { CURRENT.set(this); }
  static void clear() { CURRENT.remove(); }

  public static boolean isCancelled() {
    var context = CURRENT.get();
    return Thread.currentThread().isInterrupted() || context != null && (context.cancelled || context.timedOut());
  }

  public static void check() {
    if (isCancelled()) throw new CancellationException("Generation task cancelled");
  }
}
