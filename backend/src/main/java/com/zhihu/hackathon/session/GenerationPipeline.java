package com.zhihu.hackathon.session;

import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;

/** 网络调用在存储事务之外；搜索失败只影响当前节点。 */
public class GenerationPipeline {
  private final SessionStore store;
  private final GraphGenerator graphs;
  private final QuestionGenerator questions;
  private final ResourceSearch resources;
  private final GraphValidator validator;
  public GenerationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch resources,GraphValidator validator) {
    this.store=store;this.graphs=graphs;this.questions=questions;this.resources=resources;this.validator=validator;
  }
  public void run(long id,String target) {
    String code="GRAPH_GENERATION_FAILED";
    try {
      var generated=graphs.generateGraph(target);
      code="GRAPH_VALIDATION_FAILED";
      var graph=validator.validate(target,generated);
      code="GRAPH_GENERATION_FAILED";
      var nodes=store.saveGraph(id,target,graph);
      code="GENERATION_FAILED";
      store.generatingQuestions(id);
      code="QUESTION_GENERATION_FAILED";
      var answer=nodes.isEmpty()?List.<Question>of():questions.generateQuestions(nodes);
      code="QUESTION_VALIDATION_FAILED";
      var validatedQuestions=validator.validateQuestions(nodes,answer);
      code="QUESTION_GENERATION_FAILED";
      store.ready(id,validatedQuestions);
    } catch (RuntimeException ex) {
      if (ex instanceof ModelGenerationException) code=ex.getMessage();
      String message=switch(code) {
        case "MODEL_RATE_LIMITED" -> "模型服务请求繁忙，稍后再试。";
        case "MODEL_REQUEST_TIMEOUT" -> "AI 请求超时，请稍后重新寻路。";
        case "MODEL_JSON_PARSE_ERROR" -> "AI 返回的数据格式有误，无法解析 JSON，请重新寻路。";
        case "MODEL_INVALID_RESPONSE" -> "AI 返回内容不完整或响应格式异常，请重新寻路。";
        case "GRAPH_VALIDATION_FAILED" -> "AI 生成的图谱不符合结构要求，请重新寻路。";
        case "QUESTION_VALIDATION_FAILED" -> "AI 生成的自评问卷不符合要求，请重新寻路。";
        case "GRAPH_GENERATION_FAILED" -> "前置知识生成失败，请重新创建任务。";
        case "QUESTION_GENERATION_FAILED" -> "自评题目生成失败，请重新创建任务。";
        default -> "AI 生成请求失败，请稍后重新寻路。";
      };
      store.fail(id,code,message);
    }
  }
  /** 答卷提交后检索；网络调用不占用数据库事务。 */
  public void searchAfterAssessment(long id) {
    try {
      for (SessionStore.ResourceRequest node : store.pendingResources(id)) {
        if (Thread.currentThread().isInterrupted()) return;
        try {
          var found = resources.search(node.name(), node.count());
          store.saveResources(id, node.id(), found.stream().limit(node.count()).toList(), false);
        } catch (RuntimeException ex) {
          if (Thread.currentThread().isInterrupted()) return;
          store.saveResources(id, node.id(), List.of(), true);
        }
      }
      store.finishResources(id);
    } catch (RuntimeException ex) {
      store.finishResources(id);
    }
  }

}
