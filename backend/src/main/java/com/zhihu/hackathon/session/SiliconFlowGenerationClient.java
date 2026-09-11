package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.core.JsonParser;
import java.util.List;
import java.util.Map;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import static com.zhihu.hackathon.session.Generation.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.client.RestClient;

public class SiliconFlowGenerationClient implements GraphGenerator,QuestionGenerator {
  private final RestClient client;
  private final ObjectMapper json;
  private final String key,graphModel,questionModel;
  private final String graphPrompt,questionPrompt;
  public SiliconFlowGenerationClient(RestClient client,ObjectMapper mapper,String key,String graphModel,String questionModel) {
    this.client=client;this.key=key;this.graphModel=graphModel;this.questionModel=questionModel;
    this.graphPrompt=loadPrompt("prompts/graph-generation.md");
    this.questionPrompt=loadPrompt("prompts/question-generation.md");
    this.json=mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
  }
  public Graph generateGraph(String target) {
    return new GraphJsonValidator().validateAndRepair(call(graphModel,graphPrompt,target,true),target);
  }
  public List<Question> generateQuestions(List<SavedNode> nodes) {
    try {
      return new QuestionJsonValidator().validateAndRepair(call(questionModel,questionPrompt,json.writeValueAsString(nodes),false),nodes);
    } catch (com.fasterxml.jackson.core.JsonProcessingException ex) { throw new ModelGenerationException("MODEL_GENERATION_FAILED"); }
  }
  public record QuestionOutput(List<Question> questions) {}
  /** 从 classpath 加载，兼容 IDE 和打包后的 JAR；缺失时启动失败，避免静默使用无约束提示词。 */
  private static String loadPrompt(String path) {
    try {
      String prompt = new ClassPathResource(path).getContentAsString(StandardCharsets.UTF_8).strip();
      if (prompt.isBlank()) throw new IllegalStateException("Empty generation prompt: " + path);
      return prompt;
    } catch (IOException exception) {
      throw new IllegalStateException("Cannot load generation prompt: " + path, exception);
    }
  }
  private String call(String model,String system,String input,boolean graph) {
    if(key.isBlank()) throw new IllegalStateException("MODEL_NOT_CONFIGURED");
    try {
      var request = new java.util.HashMap<String,Object>(Map.of("model",model,
          "messages",List.of(Map.of("role","system","content",system),Map.of("role","user","content",input)),
          "response_format",Map.of("type","json_object"),"max_tokens",8192,"stream",false));
      // SiliconFlow's graph model supports this switch; the Instruct question model does not need it.
      if (graph) request.put("enable_thinking",false);
      var result=client.post().uri("/chat/completions").header("Authorization","Bearer "+key)
          .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
          .body(request)
          .retrieve().body(com.fasterxml.jackson.databind.JsonNode.class);
      var choice=result==null?null:result.path("choices").path(0);
      if(choice==null || !choice.path("finish_reason").asText().equals("stop")
          || !choice.path("message").path("content").isTextual()) throw new ModelGenerationException("MODEL_INVALID_RESPONSE");
      return choice.path("message").path("content").textValue();
    } catch (ModelGenerationException ex) {
      throw ex;
    } catch (Exception ex) {
      if (ex instanceof org.springframework.web.client.RestClientResponseException response
          && (response.getStatusCode().value() == 408 || response.getStatusCode().value() == 504))
        throw new ModelGenerationException("MODEL_REQUEST_TIMEOUT");
      for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
        if (cause instanceof java.net.SocketTimeoutException || cause instanceof java.net.http.HttpTimeoutException
            || cause instanceof java.util.concurrent.TimeoutException)
          throw new ModelGenerationException("MODEL_REQUEST_TIMEOUT");
      }
      for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
        if (cause instanceof com.fasterxml.jackson.core.JsonProcessingException)
          throw new ModelGenerationException("MODEL_JSON_PARSE_ERROR");
      }
      throw new ModelGenerationException("MODEL_GENERATION_FAILED");
    }
  }
}
