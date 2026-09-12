package com.zhihu.hackathon.session;

import org.junit.jupiter.api.Test;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TaskCapacityTest {
  @Test void queueLimitRejectsBeforeCreatingDatabaseRecord() throws Exception {
    SessionStore store=mock(SessionStore.class);
    GenerationPipeline pipeline=mock(GenerationPipeline.class);
    CountDownLatch started=new CountDownLatch(4),release=new CountDownLatch(1);
    when(store.createWithinLimits(anyLong(),anyString())).thenReturn(1L);
    doAnswer(call->{started.countDown();release.await();return null;}).when(pipeline).run(anyLong(),anyString());
    var service=new LearningSessionService(store,pipeline,4);
    try {
      for(int i=0;i<4;i++) service.create(i+1,"X");
      assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();
      for(int i=0;i<8;i++) service.create(i+5,"X");
      assertThatThrownBy(()->service.create(20,"X")).isInstanceOfSatisfying(SessionException.class,e->assertThat(e.status).isEqualTo(429));
      verify(store,times(12)).createWithinLimits(anyLong(),eq("X"));
    } finally { release.countDown();service.close(); }
  }
  @Test void eachUserHasTwoActualSlotsAndFailureReleasesThem() throws Exception {
    var store=mock(SessionStore.class);var pipeline=mock(GenerationPipeline.class);
    var started=new CountDownLatch(2);var release=new CountDownLatch(1);
    when(store.createWithinLimits(anyLong(),anyString())).thenReturn(1L);
    doAnswer(call->{started.countDown();release.await();throw new RuntimeException("test failure");}).when(pipeline).run(anyLong(),anyString());
    var service=new LearningSessionService(store,pipeline,4);
    try {
      service.create(1,"X");service.create(1,"X");
      assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(()->service.create(1,"X")).isInstanceOfSatisfying(SessionException.class,e->assertThat(e.code).isEqualTo("USER_TASK_LIMIT_REACHED"));
      service.create(2,"other user");
      verify(store,times(2)).createWithinLimits(1,"X");
      release.countDown();
      org.awaitility.Awaitility.await().dontCatchUncaughtExceptions().atMost(java.time.Duration.ofSeconds(5)).untilAsserted(()->assertThatCode(()->service.create(1,"after failure")).doesNotThrowAnyException());
    } finally { release.countDown();service.close(); }
  }
  @Test void duplicateReplayDoesNotEnqueueOrConsumeUserSlots() {
    var store=mock(SessionStore.class);var pipeline=mock(GenerationPipeline.class);
    when(store.findCreation(1,"X","request-123")).thenReturn(new SessionStore.Snapshot("9","X","READY",new SessionStore.Progress(0,0),java.util.List.of(),null));
    var service=new LearningSessionService(store,pipeline,4);
    try {
      for(int i=0;i<4;i++) assertThat(service.create(1,"X","request-123").sessionId()).isEqualTo("9");
      verifyNoInteractions(pipeline);
      verify(store,never()).createWithinLimits(anyLong(),anyString(),anyString());
    } finally { service.close(); }
  }
  @Test void resourceSearchSharesPerUserCapacity() throws Exception {
    var store=mock(SessionStore.class);var pipeline=mock(GenerationPipeline.class);
    var started=new CountDownLatch(2);var release=new CountDownLatch(1);
    when(store.createWithinLimits(anyLong(),anyString())).thenReturn(1L);
    doAnswer(call->{started.countDown();release.await();return null;}).when(pipeline).run(anyLong(),anyString());
    when(store.findOwned(1,9)).thenReturn(new SessionStore.Snapshot("9","X","READY",new SessionStore.Progress(0,1),java.util.List.of(),null));
    when(store.pendingResources(9)).thenReturn(java.util.List.of(new SessionStore.ResourceRequest(10,"A",3)));
    var service=new LearningSessionService(store,pipeline,4);
    try {
      service.create(1,"X");service.create(1,"X");assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();
      assertThatThrownBy(()->service.complete(1,"9")).isInstanceOfSatisfying(SessionException.class,e->assertThat(e.code).isEqualTo("USER_TASK_LIMIT_REACHED"));
      verify(store,never()).completeOwned(anyLong(),anyLong());
    } finally { release.countDown();service.close(); }
  }
}
