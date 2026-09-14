package com.zhihu.hackathon.session;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 业务与本地诊断共用配置；普通类避免自动生成含密钥的 toString。 */
@Component
public final class ModelSettings {
  private final String baseUrl, apiKey, graphModel, questionModel, recommendationModel;
  @org.springframework.beans.factory.annotation.Autowired
  public ModelSettings(@Value("${model.base-url:https://api.openai-next.com/v1}") String baseUrl,
      @Value("${model.api-key:}") String apiKey,
      @Value("${model.graph-model:gemini-3-flash}") String graphModel,
      @Value("${model.question-model:gemini-3.1-flash-lite}") String questionModel,
      @Value("${model.recommendation-model:}") String recommendationModel) {
    this.baseUrl=baseUrl;this.apiKey=apiKey;this.graphModel=graphModel;this.questionModel=questionModel;
    this.recommendationModel=recommendationModel.isBlank()?questionModel:recommendationModel;
  }
  public ModelSettings(String baseUrl,String apiKey,String graphModel,String questionModel) {
    this(baseUrl,apiKey,graphModel,questionModel,"");
  }
  public String baseUrl() { return baseUrl; }
  public String apiKey() { return apiKey; }
  public String graphModel() { return graphModel; }
  public String questionModel() { return questionModel; }
  public String recommendationModel() { return recommendationModel; }
}
