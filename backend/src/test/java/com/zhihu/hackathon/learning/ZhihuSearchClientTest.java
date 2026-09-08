package com.zhihu.hackathon.learning;

import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import com.zhihu.hackathon.zhihu.ZhihuSearchClient.SearchException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ZhihuSearchClientTest {
  private final RestClient.Builder builder = RestClient.builder().baseUrl("https://developer.zhihu.com");
  private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
  private final ZhihuSearchClient client = new ZhihuSearchClient(builder.build(), "test-secret",
      Clock.fixed(Instant.ofEpochSecond(1710000000), ZoneOffset.UTC));

  @Test
  void sendsProtocolHeadersAndPreservesAttributionAndUnknownVotes() {
    server.expect(requestTo("https://developer.zhihu.com/api/v1/content/zhihu_search?Query=A%26B&Count=3"))
        .andExpect(header("Authorization", "Bearer test-secret"))
        .andExpect(header("X-Request-Timestamp", "1710000000"))
        .andExpect(header("Content-Type", "application/json"))
        .andRespond(withSuccess("""
            {"Code":0,"Data":{"Items":[{"Title":"test","Url":"https://www.zhihu.com/question/1?utm_source=test"}]}}
            """, MediaType.APPLICATION_JSON));
    var result = client.search(" A&B ");
    assertThat(result).hasSize(1);
    assertThat(result.getFirst().url()).endsWith("?utm_source=test");
    assertThat(result.getFirst().voteCount()).isNull();
    server.verify();
  }

  @Test
  void treatsEmptyResultsAsSuccess() {
    server.expect(anything()).andRespond(withSuccess("{\"Code\":0,\"Data\":{\"Items\":[]}}", MediaType.APPLICATION_JSON));
    assertThat(client.search("Transformer")).isEmpty();
    server.verify();
  }

  @Test
  void rejectsAuthFailureWithoutExposingUpstreamMessage() {
    server.expect(anything()).andRespond(withSuccess("{\"Code\":20001,\"Message\":\"private upstream detail\"}", MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> client.search("Transformer")).isInstanceOfSatisfying(SearchException.class, error -> {
      assertThat(error.getMessage()).isEqualTo("ZHIHU_AUTH_FAILED");
      assertThat(error.retryable()).isFalse();
    });
    server.verify();
  }

  @Test
  void rejectsMissingItemsInsteadOfPretendingSearchWasEmpty() {
    server.expect(anything()).andRespond(withSuccess("{\"Code\":0}", MediaType.APPLICATION_JSON));
    assertThatThrownBy(() -> client.search("Transformer")).hasMessage("ZHIHU_INVALID_RESPONSE");
    server.verify();
  }
}
