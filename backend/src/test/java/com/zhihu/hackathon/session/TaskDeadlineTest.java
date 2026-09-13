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

class TaskDeadlineTest {
  @Test void queueTimeCountsAndExpiredQueuedTaskNeverCallsProvider() throws Exception {
    var store = mock(SessionStore.class);
    var pipeline = mock(GenerationPipeline.class);
    var ids = new AtomicLong();
    when(store.createWithinLimits(anyLong(), anyString())).thenAnswer(c -> ids.incrementAndGet());
    var started = new CountDownLatch(1);
    var release = new CountDownLatch(1);
    doAnswer(c -> {
      started.countDown();
      while (release.getCount() > 0) {
        try { release.await(); } catch (InterruptedException ignored) { }
      }
      return null;
    }).when(pipeline).run(1, "running");
    var service = new LearningSessionService(store, pipeline, 1, Duration.ofMillis(300), Duration.ofSeconds(5));
    try {
      service.create(1, "running");
      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      service.create(2, "queued");
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(pipeline).timeout(2, false));
      verify(pipeline, never()).run(2, "queued");
      verify(pipeline, never()).timeout(1, false);
      release.countDown();
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(pipeline).timeout(1, false));
    } finally { release.countDown(); service.close(); }
  }

  @Test void runningDeadlineStopsNextStageEvenWhenProviderClearsInterrupt() throws Exception {
    var store = mock(SessionStore.class);
    var graphs = mock(GraphGenerator.class);
    var questions = mock(QuestionGenerator.class);
    var entered = new CountDownLatch(1);
    var interrupted = new CountDownLatch(1);
    when(store.createWithinLimits(1, "slow")).thenReturn(1L);
    when(graphs.generateGraph("slow")).thenAnswer(c -> {
      entered.countDown();
      try { new CountDownLatch(1).await(); }
      catch (InterruptedException ignored) { interrupted.countDown(); }
      return new Graph(List.of(), List.of(), "target");
    });
    var pipeline = new GenerationPipeline(store, graphs, questions, mock(ResourceSearch.class), new GraphValidator());
    var service = new LearningSessionService(store, pipeline, 1, Duration.ofMillis(300), Duration.ofSeconds(5));
    try {
      service.create(1, "slow");
      assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(interrupted.await(5, TimeUnit.SECONDS)).isTrue();
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() ->
          verify(store).fail(eq(1L), eq("GENERATION_TASK_TIMEOUT"), anyString()));
      verifyNoInteractions(questions);
      verify(store, never()).saveGraph(anyLong(), anyString(), any());
    } finally { service.close(); }
  }

  @Test void resourceTimeoutPreservesResultAndMarksOnlyPendingSearchesFailed() {
    var store = mock(SessionStore.class);
    var pipeline = new GenerationPipeline(store, mock(GraphGenerator.class), mock(QuestionGenerator.class),
        mock(ResourceSearch.class), new GraphValidator());
    pipeline.timeout(10, true);
    verify(store).finishResources(10);
    verify(store, never()).fail(anyLong(), anyString(), anyString());
  }

  @Test void invalidDeadlineConfigurationFailsAtStartup() {
    assertThatThrownBy(() -> new LearningSessionService(mock(SessionStore.class), mock(GenerationPipeline.class), 1,
        Duration.ZERO, Duration.ofSeconds(1))).isInstanceOf(IllegalArgumentException.class);
  }

  @Test void questionAnsweringTimeIsNotChargedAndSearchGetsItsOwnDeadline() {
    var store = mock(SessionStore.class);
    var pipeline = mock(GenerationPipeline.class);
    when(store.createWithinLimits(1, "quick")).thenReturn(1L);
    when(store.findOwned(1, 1)).thenReturn(new SessionStore.Snapshot("1", "quick", "READY",
        new SessionStore.Progress(0, 1), List.of(), null));
    when(store.pendingResources(1)).thenReturn(List.of(new SessionStore.ResourceRequest(11, "node", 3)));
    when(store.completeOwned(1, 1)).thenReturn(new CompletionResponse("1", "SEARCHING_RESOURCES", "quick", 1, List.of(), List.of()));
    doAnswer(c -> {
      try { new CountDownLatch(1).await(); } catch (InterruptedException ignored) { }
      return null;
    }).when(pipeline).searchAfterAssessment(1);
    var service = new LearningSessionService(store, pipeline, 1, Duration.ofMillis(300), Duration.ofMillis(300));
    try {
      service.create(1, "quick");
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(pipeline).run(1, "quick"));
      await().during(Duration.ofMillis(600)).atMost(Duration.ofSeconds(3)).untilAsserted(() ->
          verify(pipeline, never()).timeout(anyLong(), anyBoolean()));
      service.complete(1, "1");
      await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(pipeline).timeout(1, true));
      verify(pipeline, never()).timeout(1, false);
    } finally { service.close(); }
  }
}
