package com.zhihu.hackathon.session;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import static org.assertj.core.api.Assertions.*;

@ExtendWith(OutputCaptureExtension.class)
class TaskDiagnosticsTest {
  @Test void failureLogsTypeAndTaskButNeverExceptionMessages(CapturedOutput output) {
    var registry = new SimpleMeterRegistry();
    var diagnostics = new TaskDiagnostics(registry);
    var error = new IllegalStateException("SECRET-outer", new IllegalArgumentException("SECRET-query-and-token"));
    assertThatThrownBy(() -> diagnostics.measure(12, "graph_store", () -> { throw error; })).isSameAs(error);
    assertThat(output.getAll()).contains("taskId=12", "stage=graph_store", "errorType=IllegalArgumentException")
        .doesNotContain("SECRET-outer", "SECRET-query-and-token");
    assertThat(registry.get("learning.task.stage").tags("stage", "graph_store", "outcome", "failed").timer().count()).isEqualTo(1);
    assertThat(registry.getMeters()).allSatisfy(meter -> assertThat(meter.getId().getTags().toString()).doesNotContain("12", "SECRET"));
  }

  @Test void genericHttpFailureKeepsResponseAndLogsFreeOfSecrets(CapturedOutput output) {
    var response = new SessionErrorHandler().unexpected(new RuntimeException("SECRET-password"));
    assertThat(response.getStatusCode().value()).isEqualTo(500);
    assertThat(response.getBody().toString()).doesNotContain("SECRET-password");
    assertThat(output.getAll()).contains("errorType=RuntimeException").doesNotContain("SECRET-password");
  }
}
