package com.zhihu.hackathon.session;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import static com.zhihu.hackathon.session.Generation.*;

/** 根据知乎文章标题批量生成短推荐理由；失败由流水线降级为无推荐理由。 */
public final class ResourceRecommendationClient implements ResourceRecommender {
  private static final String SYSTEM_PROMPT="""
      你是学习资料推荐编辑。根据知乎文章标题，为每篇文章生成一条推荐理由。
      要求：每条理由不超过10个汉字；只根据标题判断；说明为什么值得阅读；不复述标题；
      不使用句号、引号或“推荐”二字；按输入顺序返回严格JSON，不输出其他内容。
      返回格式：{"reasons":["适合快速入门","直观理解概念"]}
      """;
  private final RestClient client;
  private final ObjectMapper json;
  private final String apiKey;
  private final String model;

  public ResourceRecommendationClient(RestClient client,ObjectMapper mapper,ModelSettings settings) {
    this(client,mapper,settings.apiKey(),settings.recommendationModel());
  }
  ResourceRecommendationClient(RestClient client,ObjectMapper mapper,String apiKey,String model) {
    this.client=client;this.apiKey=apiKey;this.model=model;
    this.json=mapper.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION);
  }

  @Override public List<Resource> recommend(String nodeName,List<Resource> resources) {
    if(resources.isEmpty()) return resources;
    if(apiKey.isBlank()) throw new IllegalStateException("MODEL_NOT_CONFIGURED");
    GenerationTaskContext.check();
    try {
      var titles=new ArrayList<Map<String,Object>>();
      for(int i=0;i<resources.size();i++) titles.add(Map.of("index",i,"title",resources.get(i).title()));
      String input=json.writeValueAsString(Map.of("articles",titles));
      var messages=List.of(Map.of("role","system","content",SYSTEM_PROMPT),Map.of("role","user","content",input));
      String body=client.post().uri("/chat/completions").header("Authorization","Bearer "+apiKey)
          .header("User-Agent","KnowledgeSteps/1.0").contentType(MediaType.APPLICATION_JSON)
          .body(ModelRequest.body(model,messages,false,512)).retrieve().body(String.class);
      GenerationTaskContext.check();
      var envelope=json.readTree(body);
      var choice=envelope.path("choices").path(0);
      if(!"stop".equals(choice.path("finish_reason").asText()) || !choice.path("message").path("content").isTextual())
        throw new IllegalArgumentException("INVALID_RECOMMENDATION_RESPONSE");
      var output=parseOutput(choice.path("message").path("content").textValue());
      if(output.reasons()==null || output.reasons().size()!=resources.size())
        throw new IllegalArgumentException("INVALID_RECOMMENDATION_COUNT");
      var enriched=new ArrayList<Resource>(resources.size());
      for(int i=0;i<resources.size();i++) {
        String reason=validateReason(output.reasons().get(i));
        Resource resource=resources.get(i);
        enriched.add(new Resource(resource.title(),resource.url(),resource.summary(),resource.authorName(),
            resource.voteCount(),resource.contentDate(),reason));
      }
      return List.copyOf(enriched);
    } catch(RuntimeException exception) {
      throw exception;
    } catch(Exception exception) {
      throw new IllegalArgumentException("INVALID_RECOMMENDATION_RESPONSE",exception);
    }
  }

  private Output parseOutput(String raw) throws com.fasterxml.jackson.core.JsonProcessingException {
    String candidate=raw.strip();
    if(candidate.startsWith("```")) {
      int firstLine=candidate.indexOf('\n');
      int closing=candidate.lastIndexOf("```");
      if(firstLine>0 && closing>firstLine) candidate=candidate.substring(firstLine+1,closing).strip();
    }
    int start=candidate.indexOf('{'),end=candidate.lastIndexOf('}');
    if(start<0 || end<start) throw new IllegalArgumentException("INVALID_RECOMMENDATION_JSON");
    return json.readValue(candidate.substring(start,end+1),Output.class);
  }

  private static String validateReason(String value) {
    if(value==null) throw new IllegalArgumentException("EMPTY_RECOMMENDATION_REASON");
    String reason=value.strip();
    int length=reason.codePointCount(0,reason.length());
    if(length<1 || length>10 || reason.contains("\n") || reason.contains("推荐") || reason.matches(".*[。！？.!?\"“”].*"))
      throw new IllegalArgumentException("INVALID_RECOMMENDATION_REASON");
    return reason;
  }

  private record Output(List<String> reasons) {}
}
