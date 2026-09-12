package com.zhihu.hackathon.session;

import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class LearningSessionService {
  private final SessionStore store;
  private final GenerationPipeline pipeline;
  // 生成与资料搜索共用固定线程池，至多8个等待；进程内准入控制，单实例部署。
  private final ThreadPoolExecutor executor;
  private final java.util.Map<Long,Integer> inFlight = new java.util.HashMap<>();
  public LearningSessionService(SessionStore store,GenerationPipeline pipeline,
      @Value("${app.generation.workers:4}") int workers) {
    if (workers < 1 || workers > 32) throw new IllegalArgumentException("app.generation.workers must be between 1 and 32");
    var threadIds = new java.util.concurrent.atomic.AtomicInteger();
    executor = new ThreadPoolExecutor(workers,workers,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),
        task -> { var t=new Thread(task,"learning-generation-"+threadIds.incrementAndGet());t.setDaemon(true);return t; });
    this.store=store;this.pipeline=pipeline;
    store.recoverInterrupted();
  }

  public QuestionsResponse questions(long userId, String sessionId) {
    try { return store.findQuestionsOwned(userId, parseSessionId(sessionId)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }

  public synchronized AnswerResponse saveAnswer(long userId, String sessionId, String questionId, String answer) {
    try { return store.saveAnswerOwned(userId, parseSessionId(sessionId), parseSessionId(questionId), answer); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务或题目不存在。"); }
  }

  public synchronized CompletionResponse complete(long userId, String sessionId) {
    try {
      long id = parseSessionId(sessionId);
      var before = store.findOwned(userId, id);
      if (!before.status().equals("SEARCHING_RESOURCES") && !store.pendingResources(id).isEmpty())
        requireCapacity(userId);
      var result = store.completeOwned(userId, id);
      if (result.status().equals("SEARCHING_RESOURCES") && !before.status().equals("SEARCHING_RESOURCES")) {
        try { submit(userId, () -> pipeline.searchAfterAssessment(id)); }
        catch (RejectedExecutionException ex) { store.finishResources(id); }
      }
      return result;
    }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }

  public ResourcesResponse resources(long userId, String sessionId, String nodeId) {
    try { return store.findResourcesOwned(userId, parseSessionId(sessionId), parseSessionId(nodeId)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务或节点不存在。"); }
  }

  public record Created(String sessionId,String status) {}
  public synchronized Created create(long userId,String value) {
    return create(userId,value,null);
  }
  public synchronized Created create(long userId,String value,String requestKey) {
    String target=value==null?"":value.strip();
    if(target.isEmpty() || target.codePointCount(0,target.length())>100)
      throw new SessionException(400,"INVALID_TARGET","目标长度应为1～100个字符。");
    if(requestKey!=null && !requestKey.matches("[A-Za-z0-9._:-]{8,128}"))
      throw new SessionException(400,"INVALID_IDEMPOTENCY_KEY","请求标识格式不正确，请刷新后重试。");
    if(requestKey!=null) {
      var prior=store.findCreation(userId,target,requestKey);
      if(prior!=null) return new Created(prior.sessionId(),prior.status());
    }
    requireCapacity(userId);
    long id=requestKey==null ? store.createWithinLimits(userId,target) : store.createWithinLimits(userId,target,requestKey);
    try { submit(userId, () -> pipeline.run(id,target)); }
    catch(RejectedExecutionException ex) {
      store.fail(id,"GENERATION_INTERRUPTED","生成任务未能启动，请重新创建。");
      throw new SessionException(429,"RATE_LIMITED","生成任务繁忙，请稍后重试。");
    }
    return new Created(Long.toString(id),"GENERATING_GRAPH");
  }
  private void requireCapacity(long userId) {
    if(inFlight.getOrDefault(userId,0)>=2)
      throw new SessionException(429,"USER_TASK_LIMIT_REACHED","你已有2个任务正在处理或排队，请等待完成后再试。");
    if(executor.isShutdown() || executor.getQueue().remainingCapacity()==0)
      throw new SessionException(429,"RATE_LIMITED","任务繁忙，请稍后重试。");
  }
  // Count actual work, not history rows: deleting a running task must not release its slot early.
  private void submit(long userId,Runnable work) {
    inFlight.merge(userId,1,Integer::sum);
    try {
      executor.execute(() -> {
        try { work.run(); }
        finally { synchronized(this) { release(userId); } }
      });
    } catch(RejectedExecutionException ex) { release(userId);throw ex; }
  }
  private void release(long userId) {
    inFlight.computeIfPresent(userId,(key,count)->count<=1 ? null : count-1);
  }
  public SessionStore.Snapshot find(long userId,String id) {
    try { return store.findOwned(userId, parseSessionId(id)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }
  private long parseSessionId(String value) {
    if(value == null || !value.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException();
    return Long.parseLong(value);
  }
  @PreDestroy public void close() { executor.shutdownNow(); }
}
