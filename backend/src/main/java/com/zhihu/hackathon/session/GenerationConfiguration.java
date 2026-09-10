package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import java.time.Duration;
import static com.zhihu.hackathon.session.Generation.*;

@Configuration
public class GenerationConfiguration {
  @Bean GraphValidator graphValidator() { return new GraphValidator(); }
  @Bean SiliconFlowGenerationClient generationClient(ObjectMapper json,
      @Value("${model.base-url:https://api.siliconflow.cn/v1}") String url,
      @Value("${model.api-key:}") String key,
      @Value("${model.graph-model:deepseek-ai/DeepSeek-V4-Flash}") String a,
      @Value("${model.question-model:deepseek-ai/DeepSeek-V4-Flash}") String b) {
    var http=java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(60));
    return new SiliconFlowGenerationClient(RestClient.builder().baseUrl(url).requestFactory(factory).build(),json,key,a,b);
  }
  @Bean ResourceSearch resourceSearch(ZhihuSearchClient client) {
    return name -> {
      for(int attempt=0;;attempt++) {
        try { return client.search(name).stream().map(r -> new Resource(r.title(),r.url(),r.summary(),r.authorName(),r.voteCount())).toList(); }
        catch(ZhihuSearchClient.SearchException ex) {
          if(!ex.retryable() || attempt==1) throw ex;
          try { Thread.sleep(1000); } catch(InterruptedException interrupted) {
            Thread.currentThread().interrupt();throw new IllegalStateException("INTERRUPTED");
          }
        }
      }
    };
  }
  @Bean GenerationPipeline generationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch search,GraphValidator validator) {
    return new GenerationPipeline(store,graphs,questions,search,validator);
  }
}
