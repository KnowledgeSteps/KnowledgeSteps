package com.zhihu.hackathon.reading;

import com.fasterxml.jackson.databind.JsonNode;
import com.zhihu.hackathon.auth.CsrfTokens;
import com.zhihu.hackathon.auth.CurrentUserProvider;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1")
public class ReadingController {
  private final CurrentUserProvider users;
  private final CsrfTokens csrf;
  private final ReadingService service;
  public ReadingController(CurrentUserProvider users,CsrfTokens csrf,ReadingService service) {
    this.users=users;this.csrf=csrf;this.service=service;
  }
  @ModelAttribute public void noCache(jakarta.servlet.http.HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
  }
  @PostMapping("/learning-sessions/{sessionId}/nodes/{nodeId}/overview")
  public ReadingService.Overview overview(@PathVariable String sessionId,@PathVariable String nodeId,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    return service.overview(user,sessionId,nodeId);
  }
  @PostMapping("/learning-sessions/{sessionId}/nodes/{nodeId}/explanations")
  public ReadingService.Explanation explain(@PathVariable String sessionId,@PathVariable String nodeId,
      @RequestBody JsonNode body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    return service.explain(user,sessionId,nodeId,text(body,"resourceId",false),text(body,"quote",true),text(body,"context",false));
  }
  @PostMapping("/doubts")
  public ReadingService.Explanation save(@RequestBody JsonNode body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    return service.save(user,text(body,"explanationId",true));
  }
  @GetMapping("/doubts")
  public ReadingService.Doubts list(@RequestParam(defaultValue="1") int page) { return service.list(users.currentUserId(),page); }
  @PatchMapping("/doubts/{id}")
  public ReadingService.Explanation mark(@PathVariable String id,@RequestBody JsonNode body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    if (body==null || !body.isObject() || !body.path("understood").isBoolean()) throw ReadingService.invalid("理解状态必须是布尔值。");
    return service.mark(user,id,body.path("understood").booleanValue());
  }
  @DeleteMapping("/doubts/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@PathVariable String id,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);service.delete(user,id);
  }
  private static String text(JsonNode body,String field,boolean required) {
    if(body==null || !body.isObject()) throw ReadingService.invalid("请求格式不正确。");
    var value=body.get(field);
    if(value==null || value.isNull()) { if(required) throw ReadingService.invalid("缺少必要参数。"); return null; }
    if(!value.isTextual()) throw ReadingService.invalid("请求参数必须是文本。");
    return value.textValue();
  }
  @PostMapping("/knowledge-cards")
  public ReadingService.Overview saveCard(@RequestBody JsonNode body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    return service.saveCard(user,text(body,"sessionId",true),text(body,"nodeId",true));
  }
  @GetMapping("/knowledge-cards")
  public ReadingService.KnowledgeCards cards(@RequestParam(defaultValue="1") int page) {
    return service.cards(users.currentUserId(),page);
  }
  @DeleteMapping("/knowledge-cards/{nodeId}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void removeCard(@PathVariable String nodeId,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);service.removeCard(user,nodeId);
  }
  @PatchMapping("/knowledge-cards/{nodeId}") @ResponseStatus(HttpStatus.NO_CONTENT)
  public void markCard(@PathVariable String nodeId,@RequestBody JsonNode body,HttpServletRequest request) {
    long user=users.currentUserId();csrf.verify(request);
    if(body==null || !body.isObject() || !body.path("understood").isBoolean()) throw ReadingService.invalid("理解状态必须是布尔值。");
    service.markCard(user,nodeId,body.path("understood").booleanValue());
  }
}
