package com.zhihu.hackathon.learning;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class LearningRecordServiceTest {
  @Test
  void onlyReturnsRecordToItsOwner() {
    LearningRecord record = new LearningRecord(7L, "zhihu-user-a", "https://www.zhihu.com/question/1", "PENDING");
    LearningRecordRepository repository = new LearningRecordRepository(null) {
      @Override
      public Optional<LearningRecord> findOwnedBy(long id, String userId) {
        return record.userId().equals(userId) && record.id() == id ? Optional.of(record) : Optional.empty();
      }
    };
    LearningRecordService service = new LearningRecordService(repository);

    assertEquals(record, service.getOwnedRecord("zhihu-user-a", 7L));
    assertThrows(LearningRecordNotFoundException.class, () -> service.getOwnedRecord("zhihu-user-b", 7L));
  }
}
