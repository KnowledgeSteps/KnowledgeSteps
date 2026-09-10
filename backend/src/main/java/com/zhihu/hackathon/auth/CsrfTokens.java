package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.stereotype.Component;

@Component
public class CsrfTokens {
  private static final String KEY="knowledgeSteps.csrf";
  public String issue(HttpServletRequest request) {
    var session=request.getSession();
    synchronized(session) {
      if(session.getAttribute(KEY)==null) session.setAttribute(KEY,UUID.randomUUID().toString());
      return (String)session.getAttribute(KEY);
    }
  }
  public void verify(HttpServletRequest request) {
    var session=request.getSession(false);
    String expected=session==null?null:(String)session.getAttribute(KEY);
    String supplied=request.getHeader("X-CSRF-Token");
    if(expected==null || supplied==null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),supplied.getBytes(StandardCharsets.UTF_8)))
      throw new AuthException(403,"CSRF_INVALID","请刷新页面获取有效令牌。");
  }
}
