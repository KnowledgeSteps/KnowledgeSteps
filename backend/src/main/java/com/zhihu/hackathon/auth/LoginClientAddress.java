package com.zhihu.hackathon.auth;

import jakarta.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.HashSet;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 只信任明确配置的直属代理；Nginx 必须覆盖 X-Real-IP，而不是透传客户端值。 */
@Component
final class LoginClientAddress {
  private final Set<String> trusted = new HashSet<>();

  LoginClientAddress(@Value("${auth.admin.trusted-proxies:127.0.0.1,::1}") String proxies) {
    for (String proxy : proxies.split(",")) {
      if (proxy.isBlank()) continue;
      String address = numeric(proxy.trim());
      if (address == null) throw new IllegalArgumentException("Invalid auth.admin.trusted-proxies configuration");
      trusted.add(address);
    }
  }

  String resolve(HttpServletRequest request) {
    String peer = numeric(request.getRemoteAddr());
    if (peer == null) return "unknown";
    if (trusted.contains(peer)) {
      var headers = request.getHeaders("X-Real-IP");
      String forwarded = headers.hasMoreElements() ? numeric(headers.nextElement()) : null;
      if (forwarded != null && !headers.hasMoreElements()) return forwarded;
    }
    return peer;
  }

  private static String numeric(String input) {
    if (input == null || input.length() > 45) return null;
    // 先限制为数字地址，绝不把用户输入交给 DNS 解析。
    if (input.contains(":")) {
      if (!input.matches("[0-9a-fA-F:.]+")) return null;
    } else {
      if (!input.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}")) return null;
      for (String part : input.split("\\.")) {
        if (Integer.parseInt(part) > 255) return null;
      }
    }
    try { return InetAddress.getByName(input).getHostAddress(); }
    catch (UnknownHostException error) { return null; }
  }
}
