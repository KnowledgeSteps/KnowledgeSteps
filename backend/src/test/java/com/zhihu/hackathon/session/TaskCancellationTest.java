package com.zhihu.hackathon.session;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import static com.zhihu.hackathon.session.Generation.*;
import static org.assertj.core.api.Assertions.*;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.*;

class TaskCancellationTest {
  @Test void queuedDeletionRemovesWorkImmediatelyAndRespectsOwner() throws Exception {
    var store = mock(SessionStore.class);
    var pipeline = mock(GenerationPipeline.class);
    var ids = new AtomicLong();
    when(store.createWithinLimits(anyLong(), anyString())).thenAnswer(c -> ids.incrementAndGet());
    var started = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    doAnswer(c -> { started.countDown(); release.await(); return null; }).when(pipeline).run(1, "running");
    var service = new LearningSessionService(store, pipeline, 1);
    try {
      service.create(1, "running");
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      service.create(2, "deleted");
      service.create(2, "retained");
      service.cancelDeleted(99, 2);
      assertThatThrownBy(() -> service.create(2, "full")).isInstanceOf(SessionException.class);
      service.cancelDeleted(2, 2);
      service.cancelDeleted(2, 2);
      service.create(2, "replacement");
      assertThatThrownBy(() -> service.create(2, "still full")).isInstanceOf(SessionException.class);
      release.countDown();
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(pipeline).run(4, "replacement"));
      verify(pipeline, never()).run(2, "deleted");
      verify(pipeline).run(3, "retained");
    } finally { release.countDown(); service.close(); }
  }

  @Test void runningDeletionKeepsSlotUntilProviderActuallyExitsAndSkipsQuestions() throws Exception {
    var store = mock(SessionStore.class);
    var graphs = mock(GraphGenerator.class);
    var questions = mock(QuestionGenerator.class);
    var started = new CountDownLatch(2);
    var release = new CountDownLatch(1);
    var ids = new AtomicLong();
    when(store.createWithinLimits(anyLong(), anyString())).thenAnswer(c -> ids.incrementAndGet());
    when(graphs.generateGraph(anyString())).thenAnswer(c -> {
      started.countDown();
      // 模拟不支持中断的上游；主动清除中断，验证独立取消标记。
      boolean waiting = true;
      while (waiting) {
        try { release.await(); waiting = false; } catch (InterruptedException ignored) { }
      }
      return new Graph(List.of(), List.of(), "target");
    });
    var pipeline = new GenerationPipeline(store, graphs, questions, mock(ResourceSearch.class), new GraphValidator());
    var service = new LearningSessionService(store, pipeline, 2);
    try {
      service.create(1, "deleted"); service.create(1, "retained");
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      service.cancelDeleted(1, 1);
      assertThatThrownBy(() -> service.create(1, "full")).isInstanceOf(SessionException.class);
      release.countDown();
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> service.create(1, "replacement"));
      verify(store, never()).saveGraph(eq(1L), anyString(), any());
      verify(store, never()).fail(eq(1L), anyString(), anyString());
      verifyNoInteractions(questions);
    } finally { release.countDown(); service.close(); }
  }

  @Test void cancellingDuringSearchStopsRemainingNodesAndDoesNotSaveLateResults() {
    var store = mock(SessionStore.class);
    var search = mock(ResourceSearch.class);
    when(store.pendingResources(1)).thenReturn(List.of(
        new SessionStore.ResourceRequest(11, "first", 3), new SessionStore.ResourceRequest(12, "second", 3)));
    var context = new GenerationTaskContext();
    when(search.search("first", 3)).thenAnswer(c -> { context.cancel(); return List.of(); });
    context.install();
    try {
      new GenerationPipeline(store, mock(GraphGenerator.class), mock(QuestionGenerator.class), search, new GraphValidator())
          .searchAfterAssessment(1);
      verify(search, never()).search("second", 3);
      verify(store, never()).saveResources(anyLong(), anyLong(), anyList(), anyBoolean());
      verify(store, never()).finishResources(anyLong());
    } finally { GenerationTaskContext.clear(); }
  }
}
