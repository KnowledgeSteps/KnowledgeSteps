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
    try { if(!id.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException();return store.findOwned(userId,Long.parseLong(id)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }
  @PreDestroy public void close() { executor.shutdownNow(); }
}
