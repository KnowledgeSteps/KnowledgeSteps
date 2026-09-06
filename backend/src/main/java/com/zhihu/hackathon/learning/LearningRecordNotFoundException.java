package com.zhihu.hackathon.learning;

public class LearningRecordNotFoundException extends RuntimeException {
  public LearningRecordNotFoundException(long recordId) {
    super("未找到可访问的学习记录: " + recordId);
  }
}
