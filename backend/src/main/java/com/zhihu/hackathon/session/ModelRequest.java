package com.zhihu.hackathon.session;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ModelRequest {
  private ModelRequest() {}
  public static Map<String, Object> body(String model, List<Map<String, String>> messages, boolean graph, int tokenLimit) {
    var request = new HashMap<String, Object>(Map.of("model", model, "messages", messages,
        "response_format", Map.of("type", "json_object"), "max_tokens", tokenLimit, "stream", false));
    if (model.startsWith("gemini-")) request.put("reasoning_effort", graph ? "low" : "minimal");
    else if (graph) request.put("enable_thinking", false);
    return request;
  }
}
