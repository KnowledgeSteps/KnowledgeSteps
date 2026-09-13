package com.zhihu.hackathon.session;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TaskStageRetirementTest {
  @Test void lateGenerationTimeoutCannotFailNewSearch() throws Exception { checkRetirement(false, true); }
  @Test void lateSearchTimeoutCannotFailPendingNodesAfterAnswerEdit() throws Exception { checkRetirement(true, false); }
  @Test void lateSearchTimeoutCannotFinishASecondSearch() throws Exception { checkRetirement(true, true); }

  private void checkRetirement(boolean oldSearch, boolean startNewSearch) throws Exception {
    var state = new AtomicReference<>(oldSearch ? "READY" : "GENERATING_GRAPH");
    var committed = new CountDownLatch(1);
    var expired = new CountDownLatch(1);
    var releaseOld = new CountDownLatch(1);
    var newStarted = new CountDownLatch(1);
    var releaseNew = new CountDownLatch(1);
    var probe = new CountDownLatch(1);
    var store = mock(SessionStore.class);
    var pipeline = mock(GenerationPipeline.class);
    when(store.createWithinLimits(1, "target")).thenReturn(1L);
    when(store.createWithinLimits(2, "probe")).thenReturn(2L);
    when(store.findOwned(1, 1)).thenAnswer(c -> new SessionStore.Snapshot("1", "target", state.get(),
        new SessionStore.Progress(0, 1), List.of(), null));
    when(store.pendingResources(1)).thenReturn(List.of(new SessionStore.ResourceRequest(2, "node", 3)));
    when(store.completeOwned(1, 1)).thenAnswer(c -> {
      state.set("SEARCHING_RESOURCES");
      return new CompletionResponse("1", "SEARCHING_RESOURCES", "target", 1, List.of(), List.of());
    });
    when(store.saveAnswerOwned(1, 1, 2, "DONT_KNOW")).thenAnswer(c -> {
      state.set("READY"); return new AnswerResponse("2", "TO_LEARN", 1, 1);
    });
    Runnable previousWork = () -> {
      // 模拟 READY/COMPLETED 已提交，但原工作尚未从数据库调用返回。
      state.set(oldSearch ? "COMPLETED" : "READY");
      committed.countDown();
      hold(releaseOld, expired);
    };
    doAnswer(c -> { previousWork.run(); return null; }).when(pipeline).run(1, "target");
    var searches = new AtomicInteger();
    doAnswer(c -> {
      if (oldSearch && searches.getAndIncrement() == 0) previousWork.run();
      else { newStarted.countDown(); hold(releaseNew, new CountDownLatch(0)); }
      return null;
    }).when(pipeline).searchAfterAssessment(1);
    doAnswer(c -> { probe.countDown(); return null; }).when(pipeline).run(2, "probe");
    var service = new LearningSessionService(store, pipeline, startNewSearch ? 2 : 1,
        Duration.ofMillis(300), Duration.ofMillis(300));
    try {
      if (oldSearch) service.complete(1, "1"); else service.create(1, "target");
      assertThat(committed.await(5, TimeUnit.SECONDS)).isTrue();
      assertThat(expired.await(5, TimeUnit.SECONDS)).isTrue();
      if (oldSearch) service.saveAnswer(1, "1", "2", "DONT_KNOW");
      if (startNewSearch) {
        service.complete(1, "1");
        assertThat(newStarted.await(5, TimeUnit.SECONDS)).isTrue();
      }
      releaseOld.countDown();
      // 新搜索保持占位；probe 能运行证明旧 Work 已执行完 finally 并归还线程。
      service.create(2, "probe");
      assertThat(probe.await(5, TimeUnit.SECONDS)).isTrue();
      verify(pipeline, never()).timeout(1, oldSearch);
      assertThat(state.get()).isEqualTo(startNewSearch ? "SEARCHING_RESOURCES" : "READY");
    } finally { service.close(); releaseOld.countDown(); releaseNew.countDown(); }
  }

  private static void hold(CountDownLatch release, CountDownLatch interrupted) {
    while (release.getCount() > 0) {
      try { release.await(); } catch (InterruptedException ignored) { interrupted.countDown(); }
    }
  }
}
