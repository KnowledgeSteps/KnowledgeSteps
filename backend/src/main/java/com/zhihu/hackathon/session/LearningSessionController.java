package com.zhihu.hackathon.session;

import com.zhihu.hackathon.auth.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.HttpStatus;

@RestController
@RequestMapping("/api/v1/learning-sessions")
public class LearningSessionController {
  private final CurrentUserProvider users;
  private final CsrfTokens csrf;
  private final LearningSessionService service;
  public LearningSessionController(CurrentUserProvider users,CsrfTokens csrf,LearningSessionService service) {
    this.users=users;this.csrf=csrf;this.service=service;
  }
  public record CreateRequest(String target) {}
  @PostMapping @ResponseStatus(HttpStatus.ACCEPTED)
  public LearningSessionService.Created create(@RequestBody CreateRequest body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);return service.create(user,body.target());
  }
  @GetMapping("/{sessionId}")
  public SessionStore.Snapshot find(@PathVariable String sessionId) { return service.find(users.currentUserId(),sessionId); }

  @GetMapping("/{sessionId}/questions")
  public QuestionsResponse questions(@PathVariable String sessionId) {
    return service.questions(users.currentUserId() , sessionId);
  }

  public record AnswerRequest(String answer) {}
  @PutMapping("/{sessionId}/answers/{questionId}")
  public AnswerResponse saveAnswer(@PathVariable String sessionId, @PathVariable String questionId,
      @RequestBody AnswerRequest body, HttpServletRequest request) {
    long user=users.currentUserId();
    csrf.verify(request);
    return service.saveAnswer(user, sessionId, questionId, body == null ? null : body.answer());
  }
}
