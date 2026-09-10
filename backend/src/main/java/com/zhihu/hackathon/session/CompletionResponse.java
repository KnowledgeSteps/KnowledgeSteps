package com.zhihu.hackathon.session;

import java.util.List;

public record CompletionResponse(
    String sessionId,
    String status,
    String target,
    int missingCount,
    List<Node> nodes,
    List<Edge> edges
) {
  public record Node(String id, String name, boolean isTarget, int level) {}
  public record Edge(String from, String to) {}
}
