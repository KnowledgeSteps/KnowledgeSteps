package com.zhihu.hackathon.session;

import io.micrometer.core.instrument.MeterRegistry;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

@Component
public class TaskDiagnostics {
  private final MeterRegistry meters;
  public TaskDiagnostics(MeterRegistry meters) { this.meters = meters; }

  <T> T measure(long id, String stage, Supplier<T> action) {
    long started = System.nanoTime();
    String outcome = "success";
    try { return action.get(); }
    catch (RuntimeException error) {
      outcome = GenerationTaskContext.isCancelled() ? "cancelled" : "failed";
      LoggerFactory.getLogger(TaskDiagnostics.class).warn(
          "Task stage ended requestId={} taskId={} stage={} outcome={} errorType={} elapsedMs={}",
          MDC.get("requestId"), id, stage, outcome, errorType(error), (System.nanoTime() - started) / 1_000_000);
      throw error;
    } finally {
      meters.timer("learning.task.stage", "stage", stage, "outcome", outcome)
          .record(System.nanoTime() - started, TimeUnit.NANOSECONDS);
    }
  }

  void timeout(long id, boolean searching) {
    String stage = searching ? "resources" : "generation";
    meters.counter("learning.task.timeouts", "stage", stage).increment();
    LoggerFactory.getLogger(TaskDiagnostics.class).warn("Task deadline exceeded taskId={} stage={}", id, stage);
  }

  public static String errorType(Throwable error) {
    // 仅记录类型，不输出异常消息、SQL 参数、上游正文或带消息的堆栈。
    Throwable current = error;
    for (int i = 0; i < 8 && current.getCause() != null && current.getCause() != current; i++) current = current.getCause();
    return current.getClass().getSimpleName();
  }
}
