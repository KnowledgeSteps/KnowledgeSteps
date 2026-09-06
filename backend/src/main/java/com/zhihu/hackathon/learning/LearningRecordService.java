package com.zhihu.hackathon.learning;

import org.springframework.stereotype.Service;

@Service
public class LearningRecordService {
  private final LearningRecordRepository repository;

  public LearningRecordService(LearningRecordRepository repository) {
    this.repository = repository;
  }

  public LearningRecord save(String userId, String sourceUrl) {
    if (userId == null || userId.isBlank() || sourceUrl == null || sourceUrl.isBlank()) {
      throw new IllegalArgumentException("用户和知乎来源链接不能为空");
    }
    return repository.create(userId, sourceUrl, "PENDING");
  }

  public LearningRecord getOwnedRecord(String userId, long recordId) {
    return repository.findOwnedBy(recordId, userId)
        .orElseThrow(() -> new LearningRecordNotFoundException(recordId));
  }
}
