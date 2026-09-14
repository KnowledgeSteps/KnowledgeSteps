package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static com.zhihu.hackathon.session.Generation.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

/** Exercise repair and pipeline together: retries must not publish a failed task or save partial questions. */
class GenerationRecoveryPipelineTest {
  final ObjectMapper json = new ObjectMapper();
  final RestClient.Builder builder = RestClient.builder().baseUrl("https://model.example.invalid/v1");
  final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
  final SessionStore store = mock(SessionStore.class);
  final SiliconFlowGenerationClient model = new SiliconFlowGenerationClient(builder.build(), json,
      "unit-test-key", "gemini-3-flash", "gemini-3.1-flash-lite");
  final GenerationPipeline pipeline = new GenerationPipeline(store, model, model, mock(ResourceSearch.class), new GraphValidator());
  final List<SavedNode> nodes = List.of(new SavedNode("11", "向量", "矩阵运算的基础"));
  static final String GRAPH = """
      {"nodes":[{"key":"vector","name":"向量","description":"矩阵运算的基础"}],
       "edges":[{"from":"vector","to":"target"}],"targetDescription":"目标说明"}
      """;

  @Test void repairedGraphAndQuestionsBecomeReadyOnceWithoutIntermediateFailure() throws Exception {
    when(store.saveGraph(eq(42L), eq("矩阵"), any())).thenReturn(nodes);
    reply("{not-an-envelope");
    reply(envelope(GRAPH));
    reply(envelope("{\"questions\":["));
    reply(envelope("{\"questions\":[{\"nodeId\":\"99\",\"questionText\":\"错误映射\"}]}"));
    reply(envelope("{\"questions\":[{\"nodeId\":\"11\",\"questionText\":\"你了解向量吗？\",\"hint\":\"用途\",\"heardOfCheck\":{\"statement\":\"向量有方向\",\"expected\":true,\"explanation\":\"向量包含方向信息\"},\"basicallyKnowCheck\":{\"statement\":\"向量只能表示位置\",\"expected\":false,\"explanation\":\"向量还可表示位移等\"},\"veryFamiliarCheck\":{\"statement\":\"向量空间具有封闭性\",\"expected\":true,\"explanation\":\"线性组合仍在空间内\"}}]}"));
    pipeline.run(42L, "矩阵");
    verify(store, times(1)).saveGraph(eq(42L), eq("矩阵"), any());
    verify(store, times(1)).generatingQuestions(42L);
    verify(store, times(1)).ready(eq(42L), argThat(questions -> questions.size() == 1 && questions.getFirst().nodeId().equals("11")));
    verify(store, never()).fail(anyLong(), anyString(), anyString());
    server.verify();
  }

  @Test void repairExhaustionPublishesOneFailureWithoutSavingPartialGraph() throws Exception {
    for (int attempt = 0; attempt < 3; attempt++) reply(envelope("{\"nodes\":["));
    pipeline.run(43L, "矩阵");
    verify(store, times(1)).fail(eq(43L), eq("MODEL_JSON_PARSE_ERROR"), anyString());
    verify(store, never()).saveGraph(anyLong(), anyString(), any());
    verify(store, never()).ready(anyLong(), anyList());
    server.verify();
  }

  private void reply(String body) {
    server.expect(anything()).andRespond(request -> {
      verify(store, never()).fail(anyLong(), anyString(), anyString());
      verify(store, never()).ready(anyLong(), anyList());
      return withSuccess(body, MediaType.APPLICATION_JSON).createResponse(request);
    });
  }

  @Test void deletionDuringMalformedResponsePreventsCorrectionRequest() {
    var context = new GenerationTaskContext();
    server.expect(anything()).andRespond(request -> {
      context.cancel();
      return withSuccess("{invalid", MediaType.APPLICATION_JSON).createResponse(request);
    });
    context.install();
    try {
      pipeline.run(44L, "矩阵");
      server.verify();
      verifyNoInteractions(store);
    } finally { GenerationTaskContext.clear(); }
  }
  private String envelope(String content) throws Exception {
    return json.writeValueAsString(Map.of("choices", List.of(Map.of("finish_reason", "stop", "message", Map.of("content", content)))));
  }
}
