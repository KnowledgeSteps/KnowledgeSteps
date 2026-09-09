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
    CountDownLatch started=new CountDownLatch(1),release=new CountDownLatch(1);
    when(store.create(anyLong(),anyString())).thenReturn(1L);
    doAnswer(call->{started.countDown();release.await(5,TimeUnit.SECONDS);return null;}).when(pipeline).run(anyLong(),anyString());
    var service=new LearningSessionService(store,pipeline);
    try {
      service.create(1,"X");assertThat(started.await(2,TimeUnit.SECONDS)).isTrue();
      for(int i=0;i<8;i++) service.create(1,"X");
      assertThatThrownBy(()->service.create(1,"X")).isInstanceOfSatisfying(SessionException.class,e->assertThat(e.status).isEqualTo(429));
      verify(store,times(9)).create(1,"X");
    } finally { release.countDown();service.close(); }
  }
}
