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
      var graph=validator.validate(target,graphs.generateGraph(target));
      var nodes=store.saveGraph(id,target,graph);
      code="GENERATION_FAILED";
      for (SavedNode node:nodes) {
        if(Thread.currentThread().isInterrupted()) throw new IllegalStateException("INTERRUPTED");
        List<Resource> found;
        try { found=resources.search(node.name()); }
        catch (RuntimeException ex) { store.saveResources(Long.parseLong(node.id()),List.of(),true);continue; }
        store.saveResources(Long.parseLong(node.id()),found,false);
      }
      store.generatingQuestions(id);
      code="QUESTION_GENERATION_FAILED";
      var answer=nodes.isEmpty()?List.<Question>of():questions.generateQuestions(nodes);
      store.ready(id,validator.validateQuestions(nodes,answer));
    } catch (RuntimeException ex) {
      store.fail(id,code,code.equals("GRAPH_GENERATION_FAILED")?"前置知识生成失败，请重新创建任务。":code.equals("QUESTION_GENERATION_FAILED")?"自评题目生成失败，请重新创建任务。":"任务生成失败，请重新创建任务。");
    }
  }
}
