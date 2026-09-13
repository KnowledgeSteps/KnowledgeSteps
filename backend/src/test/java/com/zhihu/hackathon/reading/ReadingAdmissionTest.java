package com.zhihu.hackathon.reading;

import com.zhihu.hackathon.session.SessionException;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ReadingAdmissionTest {
  @Test void boundsUserRateAndConcurrentWorkAndAlwaysReleasesOnFailure() {
    var admission=new ReadingAdmission();
    admission.execute(1,()->{
      assertThatThrownBy(()->admission.execute(1,()->"duplicate")).isInstanceOf(SessionException.class);
      admission.execute(2,()->{
        assertThatThrownBy(()->admission.execute(3,()->"global-full")).isInstanceOf(SessionException.class);return null;
      });return null;
    });
    for(int i=0;i<5;i++) admission.execute(1,()->"ok");
    assertThatThrownBy(()->admission.execute(1,()->"too-frequent")).isInstanceOf(SessionException.class);
    assertThatThrownBy(()->admission.execute(3,()->{throw new IllegalStateException();})).isInstanceOf(IllegalStateException.class);
    assertThat(admission.execute(3,()->"released")).isEqualTo("released");
  }
}
