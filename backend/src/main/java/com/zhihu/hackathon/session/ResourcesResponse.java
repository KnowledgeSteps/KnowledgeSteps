package com.zhihu.hackathon.session;

import java.util.List;

public record ResourcesResponse(
    String nodeId,
    String nodeName,
    String reason,
    String resourceStatus,
    List<ResourceItem> resources
) {
  public record ResourceItem(
      String id,
      String title,
      String url,
      String summary,
      String authorName,
      Long voteCount
  ) {}
}
