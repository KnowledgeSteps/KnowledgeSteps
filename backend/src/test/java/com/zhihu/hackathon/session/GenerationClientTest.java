package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.client.RestClient;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.http.MediaType;
import java.util.Map;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GenerationClientTest {
  final ObjectMapper json=new ObjectMapper();
  final RestClient.Builder builder=RestClient.builder().baseUrl("https://example.invalid/v1");
  final MockRestServiceServer server=MockRestServiceServer.bindTo(builder).build();
  final SiliconFlowGenerationClient client=new SiliconFlowGenerationClient(builder.build(),json,"fake-key","graph-model","question-model");
  @Test void usesSeparateModelsAndJsonMode() throws Exception {
    server.expect(requestTo("https://example.invalid/v1/chat/completions"))
        .andExpect(header("Authorization","Bearer fake-key")).andExpect(jsonPath("$.model").value("graph-model"))
        .andExpect(jsonPath("$.response_format.type").value("json_object"))
        .andRespond(withSuccess(envelope("{\"nodes\":[],\"edges\":[]}","stop"),MediaType.APPLICATION_JSON));
    server.expect(anything()).andExpect(jsonPath("$.model").value("question-model"))
        .andRespond(withSuccess(envelope("{\"questions\":[{\"nodeId\":\"1\",\"questionText\":\"Q\",\"hint\":null}]}","stop"),MediaType.APPLICATION_JSON));
    assertThat(client.generateGraph("目标").nodes()).isEmpty();
    assertThat(client.generateQuestions(List.of(new Generation.SavedNode("1","A","why")))).hasSize(1);
    server.verify();
  }
  @ParameterizedTest @ValueSource(strings={"{\"nodes\":[],\"edges\":[],\"extra\":true}","{\"nodes\":[],\"edges\":[]} {}","not json"})
  void rejectsInvalidStructure(String content) throws Exception {
    server.expect(anything()).andRespond(withSuccess(envelope(content,"stop"),MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->client.generateGraph("X")).hasMessage("MODEL_GENERATION_FAILED").hasNoCause();server.verify();
  }
  @Test void rejectsTruncatedResponse() throws Exception {
    server.expect(anything()).andRespond(withSuccess(envelope("{}","length"),MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->client.generateGraph("X")).hasMessage("MODEL_GENERATION_FAILED");server.verify();
  }
  @Test void doesNotExposeUpstreamErrors() {
    server.expect(anything()).andRespond(withUnauthorizedRequest().body("private detail"));
    assertThatThrownBy(()->client.generateGraph("X")).hasMessage("MODEL_GENERATION_FAILED").hasNoCause();server.verify();
  }
  String envelope(String content,String finish) throws Exception {
    return json.writeValueAsString(Map.of("choices",List.of(Map.of("finish_reason",finish,"message",Map.of("content",content)))));
  }
}
