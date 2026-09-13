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
  private final java.util.Set<Work> jobs = new java.util.HashSet<>();
  private final ScheduledThreadPoolExecutor deadlines;
  private final java.time.Duration generationTimeout, searchTimeout;

  @org.springframework.beans.factory.annotation.Autowired
  public LearningSessionService(SessionStore store, GenerationPipeline pipeline,
      @Value("${app.generation.workers:4}") int workers,
      @Value("${app.generation.task-timeout-seconds:300}") int generationSeconds,
      @Value("${app.generation.search-timeout-seconds:180}") int searchSeconds) {
    this(store, pipeline, workers, java.time.Duration.ofSeconds(generationSeconds), java.time.Duration.ofSeconds(searchSeconds));
  }

  public LearningSessionService(SessionStore store, GenerationPipeline pipeline, int workers) {
    this(store, pipeline, workers, java.time.Duration.ofSeconds(300), java.time.Duration.ofSeconds(180));
  }

  LearningSessionService(SessionStore store, GenerationPipeline pipeline, int workers,
      java.time.Duration generationTimeout, java.time.Duration searchTimeout) {
    for (var timeout : java.util.List.of(generationTimeout, searchTimeout)) {
      if (timeout.isZero() || timeout.isNegative() || timeout.compareTo(java.time.Duration.ofHours(1)) > 0)
        throw new IllegalArgumentException("Task timeout must be positive and at most one hour");
    }
    this.generationTimeout = generationTimeout; this.searchTimeout = searchTimeout;
    if (workers < 1 || workers > 32) throw new IllegalArgumentException("app.generation.workers must be between 1 and 32");
    var threadIds = new java.util.concurrent.atomic.AtomicInteger();
    executor = new ThreadPoolExecutor(workers,workers,0,TimeUnit.MILLISECONDS,new ArrayBlockingQueue<>(8),
        task -> { var t=new Thread(task,"learning-generation-"+threadIds.incrementAndGet());t.setDaemon(true);return t; });
    this.store=store;this.pipeline=pipeline;
    store.recoverInterrupted();
    deadlines = new ScheduledThreadPoolExecutor(1, task -> {
      var thread = new Thread(task, "learning-deadlines"); thread.setDaemon(true); return thread;
    });
    deadlines.setRemoveOnCancelPolicy(true);
  }

  public QuestionsResponse questions(long userId, String sessionId) {
    try { return store.findQuestionsOwned(userId, parseSessionId(sessionId)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }

  public synchronized AnswerResponse saveAnswer(long userId, String sessionId, String questionId, String answer) {
    try {
      long id = parseSessionId(sessionId);
      var result = store.saveAnswerOwned(userId, id, parseSessionId(questionId), answer);
      // 保存成功意味着前一阶段已结束；旧工作可能仍在提交后的收尾中。
      cancelPreviousWork(userId, id);
      return result;
    }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务或题目不存在。"); }
  }

  public synchronized CompletionResponse complete(long userId, String sessionId) {
    try {
      long id = parseSessionId(sessionId);
      var before = store.findOwned(userId, id);
      if (!before.status().equals("SEARCHING_RESOURCES") && !store.pendingResources(id).isEmpty())
        requireCapacity(userId);
      var result = store.completeOwned(userId, id);
      if (!before.status().equals("SEARCHING_RESOURCES")) cancelPreviousWork(userId, id);
      if (result.status().equals("SEARCHING_RESOURCES") && !before.status().equals("SEARCHING_RESOURCES")) {
        try { submit(userId, id, true, () -> pipeline.searchAfterAssessment(id)); }
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
    try { submit(userId, id, false, () -> pipeline.run(id,target)); }
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
  private void submit(long userId,long sessionId,boolean searching,Runnable work) {
    var job = new Work(userId, sessionId, searching, work);
    inFlight.merge(userId,1,Integer::sum);
    jobs.add(job);
    try {
      executor.execute(job);
      job.deadline = deadlines.schedule(job::expire, job.timeout.toNanos(), TimeUnit.NANOSECONDS);
    } catch(RejectedExecutionException ex) { job.finish();throw ex; }
  }

  /** 删除事务成功提交后调用，所有权仍按 userId/sessionId 双重匹配。 */
  public synchronized void cancelDeleted(long userId, long sessionId) {
    cancelPreviousWork(userId, sessionId);
  }

  // 调用方持有准入锁：撤销旧 Work 的写回资格，再允许后续阶段开始。
  private void cancelPreviousWork(long userId, long sessionId) {
    for (var job : java.util.List.copyOf(jobs)) {
      if (job.userId == userId && job.sessionId == sessionId) job.cancel();
    }
  }

  private final class Work implements Runnable {
    private final String requestId = org.slf4j.MDC.get("requestId");
    private final long userId, sessionId;
    private final Runnable work;
    private final GenerationTaskContext context;
    private final java.time.Duration timeout;
    private final boolean searching;
    private ScheduledFuture<?> deadline;
    private Thread runner;
    private boolean cancelled;

    Work(long userId, long sessionId, boolean searching, Runnable work) {
      this.userId = userId; this.sessionId = sessionId; this.work = work;
      this.searching = searching;
      timeout = searching ? searchTimeout : generationTimeout;
      context = new GenerationTaskContext(timeout);
    }

    @Override public void run() {
      synchronized (LearningSessionService.this) {
        if (cancelled) { finish(); return; }
        runner = Thread.currentThread();
      }
      context.install();
      if (requestId != null) org.slf4j.MDC.put("requestId", requestId);
      try { GenerationTaskContext.check(); work.run(); }
      catch (CancellationException ignored) { /* 删除后不再保存结果或失败状态。 */ }
      catch (Exception error) {
        org.slf4j.LoggerFactory.getLogger(LearningSessionService.class).error(
            "Task execution failed requestId={} taskId={} errorType={}", requestId, sessionId, TaskDiagnostics.errorType(error));
      }
      finally {
        synchronized (LearningSessionService.this) {
          runner = null;
          GenerationTaskContext.clear();
          // 不把本任务的中断状态带入下一条复用线程的任务。
          Thread.interrupted();
          if (deadline != null) deadline.cancel(false);
          try {
            // 检查当前 Work 的资格与写回必须原子执行，不能在放锁后更新后续阶段。
            if (jobs.contains(this) && context.timedOut() && !cancelled) finalizeTimeout();
          } finally {
            finish();
            org.slf4j.MDC.remove("requestId");
          }
        }
      }
    }

    void cancel() {
      cancelled = true;
      context.cancel();
      if (executor.remove(this)) finish();
      else if (runner != null) runner.interrupt();
    }

    void finish() {
      if (deadline != null) deadline.cancel(false);
      if (jobs.remove(this)) release(userId);
    }

    void expire() {
      synchronized (LearningSessionService.this) {
        if (!jobs.contains(this) || cancelled) return;
        context.expire();
        boolean queued = executor.remove(this);
        if (queued) {
          try { finalizeTimeout(); } finally { finish(); }
        }
        else if (runner != null) runner.interrupt();
      }
    }

    private void finalizeTimeout() {
      try { pipeline.timeout(sessionId, searching); }
      catch (RuntimeException error) {
        org.slf4j.LoggerFactory.getLogger(LearningSessionService.class).error(
            "Task timeout persistence failed requestId={} taskId={} errorType={}", requestId, sessionId, TaskDiagnostics.errorType(error));
      }
    }
  }
  private void release(long userId) {
    inFlight.computeIfPresent(userId,(key,count)->count<=1 ? null : count-1);
  }
  void bindMetrics(io.micrometer.core.instrument.MeterRegistry registry) {
    registry.gauge("learning.tasks.queued", executor, value -> value.getQueue().size());
    registry.gauge("learning.tasks.running", executor, ThreadPoolExecutor::getActiveCount);
  }
  public SessionStore.Snapshot find(long userId,String id) {
    try { return store.findOwned(userId, parseSessionId(id)); }
    catch(NumberFormatException ex) { throw new SessionException(404,"NOT_FOUND","任务不存在。"); }
  }
  private long parseSessionId(String value) {
    if(value == null || !value.matches("[1-9][0-9]{0,18}")) throw new NumberFormatException();
    return Long.parseLong(value);
  }
  @PreDestroy public synchronized void close() {
    for (var job : java.util.List.copyOf(jobs)) job.cancel();
    for (var queued : executor.shutdownNow()) ((Work) queued).finish();
    deadlines.shutdownNow();
  }
}
