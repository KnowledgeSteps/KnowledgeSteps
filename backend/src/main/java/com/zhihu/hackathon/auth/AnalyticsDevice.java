package com.zhihu.hackathon.auth;

import java.util.Locale;

/** Coarse categories only; never persist the original User-Agent. */
record AnalyticsDevice(String os, String browser) {
  static AnalyticsDevice parse(String agent) {
    String ua=agent == null ? "" : agent.substring(0,Math.min(agent.length(),1024)).toLowerCase(Locale.ROOT);
    String os=ua.contains("android") ? "Android" : ua.contains("iphone") || ua.contains("ipad") ? "iOS"
        : ua.contains("windows") ? "Windows" : ua.contains("cros") ? "ChromeOS"
        : ua.contains("macintosh") || ua.contains("mac os") ? "macOS" : ua.contains("linux") ? "Linux" : "未知";
    String browser=ua.contains("edg/") || ua.contains("edgios") || ua.contains("edga/") ? "Edge"
        : ua.contains("opr/") || ua.contains("opera") ? "Opera"
        : ua.contains("micromessenger") ? "微信" : ua.contains("samsungbrowser") ? "Samsung Internet"
        : ua.contains("firefox") || ua.contains("fxios") ? "Firefox"
        : ua.contains("chrome") || ua.contains("crios") ? "Chrome"
        : ua.contains("safari") ? "Safari" : "未知";
    return new AnalyticsDevice(os,browser);
  }
}
