package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import java.time.Duration;
import static com.zhihu.hackathon.session.Generation.*;

@Configuration
public class GenerationConfiguration {
  @Bean GraphValidator graphValidator() { return new GraphValidator(); }
  @Bean("modelRestClient") RestClient modelRestClient(ModelSettings settings) {
    var http=java.net.http.HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(60));
    return RestClient.builder().baseUrl(settings.baseUrl()).requestFactory(factory).build();
  }
  @Bean SiliconFlowGenerationClient generationClient(ObjectMapper json, ModelSettings settings,
      @org.springframework.beans.factory.annotation.Qualifier("modelRestClient") RestClient client) {
    return new SiliconFlowGenerationClient(client,json,settings.apiKey(),settings.graphModel(),settings.questionModel());
  }
  @Bean ResourceSearch resourceSearch(ZhihuSearchClient client) {
    return (name, count) -> {
      for(int attempt=0;;attempt++) {
        try { return client.search(name, count).stream().map(r -> new Resource(r.title(),r.url(),r.summary(),r.authorName(),r.voteCount(),r.contentDate())).toList(); }
        catch(ZhihuSearchClient.SearchException ex) {
          if(!ex.retryable() || attempt==1) throw ex;
          try { Thread.sleep(1000); } catch(InterruptedException interrupted) {
            Thread.currentThread().interrupt();throw new IllegalStateException("INTERRUPTED");
          }
        }
      }
    };
  }
  @Bean ResourceRecommendationClient resourceRecommendationClient(ObjectMapper json, ModelSettings settings,
      @org.springframework.beans.factory.annotation.Qualifier("modelRestClient") RestClient client) {
    return new ResourceRecommendationClient(client,json,settings);
  }
  @Bean GenerationPipeline generationPipeline(SessionStore store,GraphGenerator graphs,QuestionGenerator questions,ResourceSearch search,
      ResourceRecommender recommender,GraphValidator validator,TaskDiagnostics diagnostics) {
    return new GenerationPipeline(store,graphs,questions,search,recommender,validator,diagnostics);
  }
  @Bean io.micrometer.core.instrument.binder.MeterBinder taskCapacityMetrics(LearningSessionService sessions) {
    return sessions::bindMetrics;
  }
}
