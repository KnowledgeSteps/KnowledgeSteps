package com.zhihu.hackathon.session;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice(assignableTypes=LearningSessionController.class)
public class SessionErrorHandler {
  @ExceptionHandler(SessionException.class)
  ResponseEntity<?> business(SessionException ex) {
    var response=ResponseEntity.status(ex.status);
    if(ex.status==429) response.header("Retry-After","5");
    return response.body(Map.of("error",Map.of("code",ex.code,"message",ex.getMessage())));
  }
  @ExceptionHandler(HttpMessageNotReadableException.class)
  ResponseEntity<?> malformed() { return business(new SessionException(400,"INVALID_TARGET","请求体格式不正确。")); }
  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unexpected() { return business(new SessionException(500,"INTERNAL_ERROR","服务暂时不可用，请重试。")); }
}
