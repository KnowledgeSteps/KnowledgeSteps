package com.zhihu.hackathon.reading;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zhihu.hackathon.session.ModelSettings;
import com.zhihu.hackathon.session.SessionException;
import java.util.Map;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class ReadingModelClientTest {
  private final ObjectMapper json=new ObjectMapper();
  private String envelope(String raw) throws Exception {
    return json.writeValueAsString(Map.of("choices",List.of(Map.of("finish_reason","stop","message",Map.of("content",raw)))));
  }
  private String valid() throws Exception { return json.writeValueAsString(Map.of("contentMarkdown","## 知识点\n"+"一个通俗的例子。".repeat(60))); }
  @Test void sendsValidationErrorBackForOneBoundedCorrection() throws Exception {
    var builder=RestClient.builder().baseUrl("https://model.invalid/v1");var server=MockRestServiceServer.bindTo(builder).build();
    var model=new ReadingModelClient(json,new ModelSettings("https://model.invalid/v1","test-key","graph","questions"),builder.build());
    server.expect(requestTo("https://model.invalid/v1/chat/completions")).andExpect(method(HttpMethod.POST))
        .andExpect(content().string(org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.containsString("DONT_KNOW"),org.hamcrest.Matchers.containsString("userMastery"),org.hamcrest.Matchers.containsString("不了解"),org.hamcrest.Matchers.containsString("500～700"))))
        .andRespond(withSuccess(envelope("{broken}"),MediaType.APPLICATION_JSON));
    server.expect(requestTo("https://model.invalid/v1/chat/completions")).andExpect(content().string(org.hamcrest.Matchers.containsString("上次输出未通过 JSON 或内容安全校验"))).andRespond(withSuccess(envelope("```json\n"+valid()+"\n```"),MediaType.APPLICATION_JSON));
    assertThat(model.overview("目标","向量","介绍","DONT_KNOW")).contains("知识点");server.verify();
  }
  @Test void rejectsRawHtmlAfterTwoAttemptsAndDoesNotLeakUpstreamOutput() throws Exception {
    var builder=RestClient.builder().baseUrl("https://model.invalid/v1");var server=MockRestServiceServer.bindTo(builder).build();
    var model=new ReadingModelClient(json,new ModelSettings("https://model.invalid/v1","test-key","graph","questions"),builder.build());
    for(int i=0;i<2;i++) server.expect(requestTo("https://model.invalid/v1/chat/completions")).andRespond(withSuccess(envelope(json.writeValueAsString(Map.of("contentMarkdown","<script>secret</script>"+"内容".repeat(100)))),MediaType.APPLICATION_JSON));
    assertThatThrownBy(()->model.explain("目标","向量","句子","摘要")).isInstanceOf(SessionException.class).hasMessage("讲解未通过格式校验，请重试。");server.verify();
  }
  @Test void upstreamFailureIsNotRetriedAndKeysAreNotExposed() {
    var builder=RestClient.builder().baseUrl("https://model.invalid/v1");var server=MockRestServiceServer.bindTo(builder).build();
    var model=new ReadingModelClient(json,new ModelSettings("https://model.invalid/v1","test-key","graph","questions"),builder.build());
    server.expect(requestTo("https://model.invalid/v1/chat/completions")).andRespond(withServerError().body("private provider response"));
    assertThatThrownBy(()->model.overview("目标","向量","介绍","VERY_FAMILIAR")).isInstanceOf(SessionException.class).hasMessage("阅读助手暂时无法生成讲解，请稍后重试。");server.verify();
  }
}
