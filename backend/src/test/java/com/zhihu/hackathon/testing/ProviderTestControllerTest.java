package com.zhihu.hackathon.testing;

import com.zhihu.hackathon.zhihu.ZhihuSearchClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import java.io.IOException;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

class ProviderTestControllerTest {
  private MockRestServiceServer upstream;
  private MockMvc mvc;
  private ZhihuSearchClient zhihu;

  @BeforeEach
  void setup() {
    var builder = RestClient.builder().baseUrl("https://example.invalid/v1");
    upstream = MockRestServiceServer.bindTo(builder).build();
    zhihu = mock(ZhihuSearchClient.class);
    mvc = MockMvcBuilders.standaloneSetup(new ProviderTestController(zhihu, builder.build(), "fake-key", "test-model")).build();
  }

  @Test
  void sendsAiRequestAndReturnsOnlyContentAndModel() throws Exception {
    upstream.expect(requestTo("https://example.invalid/v1/chat/completions"))
        .andExpect(header("Authorization", "Bearer fake-key"))
        .andExpect(content().json("""
            {"model":"test-model","messages":[{"role":"user","content":"hello"}],"stream":false,"max_tokens":1024}
            """))
        .andRespond(withSuccess("""
            {"choices":[{"finish_reason":"stop","message":{"content":"OK"}}],"internal":"hidden"}
            """, MediaType.APPLICATION_JSON));
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\"hello\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.content").value("OK"))
        .andExpect(jsonPath("$.internal").doesNotExist());
    upstream.verify();
  }

  @ParameterizedTest
  @ValueSource(ints = {401, 403, 429, 500})
  void sanitizesUpstreamHttpErrors(int code) throws Exception {
    upstream.expect(anything()).andRespond(withRawStatus(code).body("private provider details fake-key"));
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\"hello\"}"))
        .andExpect(status().isBadGateway())
        .andExpect(jsonPath("$.error.code").value("AI_UPSTREAM_HTTP_" + code));
    upstream.verify();
  }

  @Test
  void sanitizesTransportFailure() throws Exception {
    upstream.expect(anything()).andRespond(withException(new IOException("private details")));
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\"hello\"}"))
        .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("AI_REQUEST_FAILED"));
    upstream.verify();
  }

  @ParameterizedTest
  @ValueSource(strings = {"{}", "{\"choices\":[{\"message\":{\"content\":\" \"}}]}"})
  void rejectsMissingOrEmptyContent(String body) throws Exception {
    upstream.expect(anything()).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\"hello\"}"))
        .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("AI_INVALID_RESPONSE"));
    upstream.verify();
  }

  @Test
  void rejectsTruncatedOutput() throws Exception {
    upstream.expect(anything()).andRespond(withSuccess("{\"choices\":[{\"finish_reason\":\"length\"}]}", MediaType.APPLICATION_JSON));
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\"hello\"}"))
        .andExpect(status().isBadGateway()).andExpect(jsonPath("$.error.code").value("AI_OUTPUT_TRUNCATED"));
    upstream.verify();
  }

  @Test
  void rejectsBlankInputsWithoutCallingProviders() throws Exception {
    mvc.perform(post("/api/test/ai").contentType(MediaType.APPLICATION_JSON).content("{\"prompt\":\" \"}"))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/test/zhihu/search").param("query", " ")).andExpect(status().isBadRequest());
    verifyNoInteractions(zhihu);
    upstream.verify();
  }

  @Test
  void returnsZhihuResources() throws Exception {
    when(zhihu.search("Transformer")).thenReturn(List.of());
    mvc.perform(get("/api/test/zhihu/search").param("query", " Transformer "))
        .andExpect(status().isOk()).andExpect(jsonPath("$.resources").isEmpty());
    verify(zhihu).search("Transformer");
  }
}
