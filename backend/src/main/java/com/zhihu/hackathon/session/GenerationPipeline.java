package com.zhihu.hackathon.session;

import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;

/** 网络调用在存储事务之外；搜索失败只影响当前节点。 */
public class GenerationPipeline {
  private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(GenerationPipeline.class);
  private final SessionStore store;
  private final GraphGenerator graphs;
  private final QuestionGenerator questions;
  private final ResourceSearch resources;
  private final ResourceRecommender recommender;
  private final GraphValidator validator;
  private final TaskDiagnostics diagnostics;
  public GenerationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch resources,GraphValidator validator) {
    this(store, graphs, questions, resources, (node, found) -> found, validator, new TaskDiagnostics(new io.micrometer.core.instrument.simple.SimpleMeterRegistry()));
  }
  public GenerationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch resources,
      GraphValidator validator, TaskDiagnostics diagnostics) {
    this(store, graphs, questions, resources, (node, found) -> found, validator, diagnostics);
  }
  public GenerationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch resources,
      ResourceRecommender recommender, GraphValidator validator, TaskDiagnostics diagnostics) {
    this.store=store;this.graphs=graphs;this.questions=questions;this.resources=resources;this.validator=validator;
    this.recommender=recommender;
    this.diagnostics=diagnostics;
  }
  public void run(long id,String target) {
    String code="GRAPH_GENERATION_FAILED";
    try {
      GenerationTaskContext.check();
      var generated=diagnostics.measure(id,"graph_request", () -> graphs.generateGraph(target));
      GenerationTaskContext.check();
      code="GRAPH_VALIDATION_FAILED";
      var graph=diagnostics.measure(id,"graph_validation", () -> validator.validate(target,generated));
      code="GRAPH_GENERATION_FAILED";
      var nodes=diagnostics.measure(id,"graph_store", () -> store.saveGraph(id,target,graph));
      code="GENERATION_FAILED";
      diagnostics.measure(id,"question_state", () -> { store.generatingQuestions(id); return null; });
      code="QUESTION_GENERATION_FAILED";
      GenerationTaskContext.check();
      var answer=nodes.isEmpty()?List.<Question>of():diagnostics.measure(id,"question_request", () -> questions.generateQuestions(nodes));
      GenerationTaskContext.check();
      code="QUESTION_VALIDATION_FAILED";
      var validatedQuestions=diagnostics.measure(id,"question_validation", () -> validator.validateQuestions(nodes,answer));
      code="QUESTION_GENERATION_FAILED";
      diagnostics.measure(id,"question_store", () -> { store.ready(id,validatedQuestions); return null; });
    } catch (RuntimeException ex) {
      if (GenerationTaskContext.isCancelled()) return;
      if (ex instanceof ModelGenerationException) code=ex.getMessage();
      String message=switch(code) {
        case "MODEL_RATE_LIMITED" -> "模型服务请求繁忙，稍后再试。";
        case "MODEL_REQUEST_TIMEOUT" -> "AI 请求超时，请稍后重新寻路。";
        case "MODEL_JSON_PARSE_ERROR","MODEL_INVALID_RESPONSE" -> "AI 返回内容未通过校验，自动修复重试后仍未成功，请稍后重试。";
        case "GRAPH_VALIDATION_FAILED" -> "AI 生成的图谱在自动修复重试后仍不符合结构要求，请稍后重试。";
        case "QUESTION_VALIDATION_FAILED" -> "AI 生成的自评问卷在自动修复重试后仍不符合要求，请稍后重试。";
        case "MODEL_RESPONSE_REJECTED" -> "模型服务未能处理该学习目标，请调整目标后重试。";
        case "GRAPH_GENERATION_FAILED" -> "前置知识生成失败，请重新创建任务。";
        case "QUESTION_GENERATION_FAILED" -> "自评题目生成失败，请重新创建任务。";
        default -> "AI 生成请求失败，请稍后重新寻路。";
      };
      String failureCode=code;
      diagnostics.measure(id,"failure_store", () -> { store.fail(id,failureCode,message); return null; });
    }
  }
  /** 总时限耗尽；资料阶段保留已完成部分，通过失败节点警告说明不完整结果。 */
  public void timeout(long id, boolean searching) {
    diagnostics.timeout(id, searching);
    diagnostics.measure(id,"timeout_store", () -> {
      if (searching) store.finishResources(id);
      else store.fail(id, "GENERATION_TASK_TIMEOUT", "本次生成等待时间过长，已停止处理，请稍后重新寻路。");
      return null;
    });
  }

  /** 答卷提交后检索；网络调用不占用数据库事务。 */
  public void searchAfterAssessment(long id) {
    try {
      for (SessionStore.ResourceRequest node : diagnostics.measure(id,"resource_pending", () -> store.pendingResources(id))) {
        if (GenerationTaskContext.isCancelled()) return;
        try {
          var found = diagnostics.measure(id,"resource_request", () -> resources.search(node.name(), node.count())).stream().limit(node.count()).toList();
          GenerationTaskContext.check();
          var searched=found;
          try {
            found=diagnostics.measure(id,"resource_recommendation", () -> recommender.recommend(node.name(), searched));
          } catch (RuntimeException recommendationFailure) {
            if (GenerationTaskContext.isCancelled()) return;
            LOG.warn("Resource recommendation unavailable; keeping searched resources: sessionId={}, nodeId={}",
                id,node.id());
          }
          var enriched=found;
          diagnostics.measure(id,"resource_store", () -> { store.saveResources(id, node.id(), enriched, false); return null; });
        } catch (RuntimeException ex) {
          if (GenerationTaskContext.isCancelled()) return;
          diagnostics.measure(id,"resource_failure_store", () -> { store.saveResources(id, node.id(), List.of(), true); return null; });
        }
      }
      if (!GenerationTaskContext.isCancelled()) diagnostics.measure(id,"resource_finish", () -> { store.finishResources(id); return null; });
    } catch (RuntimeException ex) {
      if (!GenerationTaskContext.isCancelled()) diagnostics.measure(id,"resource_finish_recovery", () -> { store.finishResources(id); return null; });
    }
  }

}
