package com.zhihu.hackathon.session;

import java.util.concurrent.*;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;

@Service
public class LearningSessionService {
  private final SessionStore store;
  private final GenerationPipeline pipeline;
  // 一次只处理一个任务，至多8个等待；进程内准入控制，单实例部署。
  private final ThreadPoolExecutor executor=new ThreadPoolExecutor(1,1,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),
      task -> { var t=new Thread(task,"learning-generation");t.setDaemon(true);return t; });
  public LearningSessionService(SessionStore store,GenerationPipeline pipeline) {
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
      if (!before.status().equals("SEARCHING_RESOURCES") && !store.pendingResources(id).isEmpty()
          && (executor.isShutdown() || executor.getQueue().remainingCapacity() == 0))
        throw new SessionException(429,"RATE_LIMITED","资料搜索繁忙，请稍后再次提交。");
      var result = store.completeOwned(userId, id);
      if (result.status().equals("SEARCHING_RESOURCES") && !before.status().equals("SEARCHING_RESOURCES")) {
        try { executor.execute(() -> pipeline.searchAfterAssessment(id)); }
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
    String target=value==null?"":value.strip();
    if(target.isEmpty() || target.codePointCount(0,target.length())>100)
      throw new SessionException(400,"INVALID_TARGET","目标长度应为1～100个字符。");
    if(executor.isShutdown() || executor.getQueue().remainingCapacity()==0)
      throw new SessionException(429,"RATE_LIMITED","生成任务繁忙，请稍后重试。");
    long id=store.create(userId,target);
    try { executor.execute(() -> pipeline.run(id,target)); }
    catch(RejectedExecutionException ex) {
      store.fail(id,"GENERATION_INTERRUPTED","生成任务未能启动，请重新创建。");
      throw new SessionException(429,"RATE_LIMITED","生成任务繁忙，请稍后重试。");
    }
    return new Created(Long.toString(id),"GENERATING_GRAPH");
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
