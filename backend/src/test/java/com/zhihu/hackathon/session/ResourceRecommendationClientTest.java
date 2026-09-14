package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static com.zhihu.hackathon.session.Generation.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ResourceRecommendationClientTest {
  private final ObjectMapper json=new ObjectMapper();
  private String envelope(String content) throws Exception {
    return json.writeValueAsString(Map.of("choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",content)))));
  }
  @Test void batchesTitlesAndUsesDedicatedSmallModel() throws Exception {
    var builder=RestClient.builder().baseUrl("https://model.invalid/v1");
    var server=MockRestServiceServer.bindTo(builder).build();
    var client=new ResourceRecommendationClient(builder.build(),json,"key","gemini-3.1-flash-lite");
    server.expect(requestTo("https://model.invalid/v1/chat/completions"))
        .andExpect(content().string(org.hamcrest.Matchers.allOf(
            org.hamcrest.Matchers.containsString("gemini-3.1-flash-lite"),
            org.hamcrest.Matchers.containsString("矩阵乘法怎么理解"),
            org.hamcrest.Matchers.containsString("特征向量有什么用"),
            org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("不应发送的摘要")))))
        .andRespond(withSuccess(envelope("{\"reasons\":[\"直观理解概念\",\"联系实际应用\"]}"),MediaType.APPLICATION_JSON));
    var result=client.recommend("线性代数",List.of(
        new Resource("矩阵乘法怎么理解","u1","不应发送的摘要","甲",1L),
        new Resource("特征向量有什么用","u2","不应发送的摘要","乙",2L)));
    assertThat(result).extracting(Resource::recommendationReason)
        .containsExactly("直观理解概念","联系实际应用");
    server.verify();
  }
  @Test void rejectsReasonsOverTenCharacters() throws Exception {
    var builder=RestClient.builder().baseUrl("https://model.invalid/v1");
    var server=MockRestServiceServer.bindTo(builder).build();
    var client=new ResourceRecommendationClient(builder.build(),json,"key","gemini-3.1-flash-lite");
    server.expect(requestTo("https://model.invalid/v1/chat/completions"))
        .andRespond(withSuccess(envelope("{\"reasons\":[\"这是超过十个汉字的推荐理由\"]}"),MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> client.recommend("线性代数",List.of(new Resource("标题","u",null,null,null))))
        .isInstanceOf(IllegalArgumentException.class).hasMessage("INVALID_RECOMMENDATION_REASON");
  }
}
