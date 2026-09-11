package com.zhihu.hackathon.auth;

import java.util.Map;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(basePackages = "com.zhihu.hackathon")
public class AuthErrorHandler {
  @ExceptionHandler(AuthException.class)
  ResponseEntity<?> handle(AuthException error) {
    var response = ResponseEntity.status(error.status()).header("Cache-Control", "no-store");
    if (error.status() == 429) response.header("Retry-After", "60");
    return response
        .body(Map.of("error", Map.of("code", error.code(), "message", error.getMessage())));
  }
}
