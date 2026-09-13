package com.zhihu.hackathon.auth;

import jakarta.annotation.PreDestroy;
import java.nio.file.*;
import java.io.InputStream;
import org.lionsoul.ip2region.service.Config;
import org.lionsoul.ip2region.service.Ip2Region;
import org.springframework.stereotype.Component;

/** Offline lookups: no visitor address leaves the server. Vector cache keeps memory bounded. */
@Component
public class AnalyticsGeo {
  public record Place(String country, String region) {}
  private final Path directory;
  private final Ip2Region searcher;
  public AnalyticsGeo() { this(name -> AnalyticsGeo.class.getResourceAsStream(name)); }
  @FunctionalInterface interface ResourceReader { InputStream open(String name) throws java.io.IOException; }
  AnalyticsGeo(ResourceReader resources) {
    Path folder=null;
    Ip2Region ready=null;
    try {
      folder=Files.createTempDirectory("ksteps-geodata-");
      for(String version:new String[]{"v4","v6"}) {
        try(InputStream input=resources.open("/geo/ip2region_"+version+".xdb")) {
          if(input==null) throw new IllegalStateException("Missing offline geo database");
          Files.copy(input,folder.resolve(version+".xdb"));
        }
      }
      ready=Ip2Region.create(
          Config.custom().setCachePolicy(Config.VIndexCache).setSearchers(2).setXdbPath(folder.resolve("v4.xdb").toString()).asV4(),
          Config.custom().setCachePolicy(Config.VIndexCache).setSearchers(2).setXdbPath(folder.resolve("v6.xdb").toString()).asV6());
    } catch(Exception e) {
      org.slf4j.LoggerFactory.getLogger(AnalyticsGeo.class).warn("Offline geolocation unavailable; continuing without regions. errorType={}", e.getClass().getSimpleName());
      cleanup(folder);
    }
    directory=folder;
    searcher=ready;
  }
  public Place lookup(String ip) {
    if(searcher==null || ip==null || "unknown".equals(ip)) return new Place("未知","未知");
    try {
      String value=searcher.search(ip);
      if(value==null) return new Place("未知","未知");
      String[] fields=value.split("\\|",-1);
      // Current xdb uses country|province|city|isp|iso-code.
      String country=part(fields,0), region=part(fields,1);
      if(country.contains("内网") || country.equals("保留地址")) return new Place("内网","未知");
      return new Place(country,region);
    } catch(InterruptedException e) { Thread.currentThread().interrupt(); return new Place("未知","未知"); }
    catch(Exception e) { return new Place("未知","未知"); }
  }
  private static String part(String[] values,int i) {
    return i>=values.length || values[i].isBlank() || values[i].equals("0") ? "未知" : values[i];
  }
  @PreDestroy public void close() throws Exception { try { if(searcher!=null) searcher.close(); } finally { cleanup(directory); } }
  private static void cleanup(Path directory) {
    if(directory==null) return;
    try {
      Files.deleteIfExists(directory.resolve("v4.xdb")); Files.deleteIfExists(directory.resolve("v6.xdb")); Files.deleteIfExists(directory);
    } catch(java.io.IOException e) {
      org.slf4j.LoggerFactory.getLogger(AnalyticsGeo.class).warn("Offline geo temporary cleanup deferred. errorType={}", e.getClass().getSimpleName());
    }
  }
}
