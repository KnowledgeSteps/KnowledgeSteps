package com.zhihu.hackathon.session;

/** 自评档位对应资料上限，实际结果可以不足。 */
public final class ResourcePolicy {
  private ResourcePolicy() {}
  public static int limit(String answer) {
    if (answer == null) return 0;
    return switch (answer) {
      case "VERY_FAMILIAR" -> 0;
      case "BASICALLY_KNOW" -> 2;
      case "HEARD_OF" -> 3;
      case "DONT_KNOW" -> 5;
      default -> throw new IllegalArgumentException("INVALID_ANSWER");
    };
  }
}
