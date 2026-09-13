package com.zhihu.hackathon.auth;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VisitorAnalytics {
  static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
  private final JdbcTemplate jdbc;
  public VisitorAnalytics(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  public record Day(String day, long pv, long uv, long ip) {}
  public record Bucket(String name, long value) {}
  public record Report(String timezone, List<Day> days, List<Bucket> hours, List<Bucket> countries,
      List<Bucket> regions, List<Bucket> systems, List<Bucket> browsers, List<Bucket> ips) {}
  public record Visit(long id, String time, String page, String ip, String country, String region, String os, String browser) {}
  public record Visits(long total, int page, int pageSize, List<Visit> items) {}

  @Transactional
  public void prune(Instant now) {
    jdbc.update("DELETE FROM analytics_receipts WHERE expires_ms<=?", now.toEpochMilli());
    jdbc.update("DELETE FROM analytics_daily WHERE day<?", now.atZone(ZONE).toLocalDate().minusDays(29).toString());
  }

  @Transactional
  public void record(String visitor, String ip, String event, Instant now) {
    record(visitor,ip,event,now,"unknown",new AnalyticsDevice("未知","未知"),new AnalyticsGeo.Place("未知","未知"));
  }

  @Transactional
  public void record(String visitor, String ip, String event, Instant now, String page,
      AnalyticsDevice device, AnalyticsGeo.Place place) {
    // First statement acquires SQLite's write lock before any read.
    jdbc.update("UPDATE analytics_settings SET id=id WHERE id=1");
    String secret = jdbc.queryForObject("SELECT secret FROM analytics_settings WHERE id=1", String.class);
    String day = now.atZone(ZONE).toLocalDate().toString();
    jdbc.update("DELETE FROM analytics_receipts WHERE expires_ms<=?", now.toEpochMilli());
    String receipt = hash(secret, "event:" + visitor + ":" + event);
    if (jdbc.update("INSERT OR IGNORE INTO analytics_receipts VALUES (?,?)", receipt,
        now.toEpochMilli() + 600_000) == 0) return;
    jdbc.update("INSERT INTO analytics_daily(day,pv) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET pv=pv+1", day);
    jdbc.update("INSERT OR IGNORE INTO analytics_unique VALUES (?,'uv',?)", day, hash(secret, day + ":uv:" + visitor));
    if (!"unknown".equals(ip)) {
      jdbc.update("INSERT OR IGNORE INTO analytics_unique VALUES (?,'ip',?)", day, hash(secret, day + ":ip:" + ip));
    }
    dimension(day,"hour",Integer.toString(now.atZone(ZONE).getHour()));
    dimension(day,"country",place.country());
    if (place.country().equals("中国") || place.country().equals("China")) dimension(day,"region",place.region());
    dimension(day,"os",device.os()); dimension(day,"browser",device.browser());
    String label="unknown".equals(ip) ? "未知" : day+" / "+hash(secret,day+":ip:"+ip).substring(0,12);
    if (!"unknown".equals(ip)) dimension(day,"ip",label);
    jdbc.update("INSERT INTO analytics_visits(day,occurred_at,page,ip_label,country,region,os,browser) VALUES (?,?,?,?,?,?,?,?)",
        day,now.toString(),page,label,place.country(),place.region(),device.os(),device.browser());
    jdbc.update("DELETE FROM analytics_visits WHERE id <= (SELECT id FROM analytics_visits ORDER BY id DESC LIMIT 1 OFFSET 5000)");
    jdbc.update("DELETE FROM analytics_daily WHERE day<?", now.atZone(ZONE).toLocalDate().minusDays(29).toString());
  }

  @Transactional(readOnly = true)
  public Report report(Instant now) {
    return report(now,null,null);
  }

  @Transactional(readOnly = true)
  public Report report(Instant now, String start, String end) {
    LocalDate[] range=range(now,start,end);
    LocalDate first=range[0], today=range[1];
    Map<String, Day> existing = new HashMap<>();
    jdbc.query("""
        SELECT d.day,d.pv,
          (SELECT count(*) FROM analytics_unique u WHERE u.day=d.day AND u.kind='uv') uv,
          (SELECT count(*) FROM analytics_unique u WHERE u.day=d.day AND u.kind='ip') ip
        FROM analytics_daily d WHERE d.day>=? AND d.day<=? ORDER BY d.day
        """, (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
          var d = new Day(rs.getString("day"), rs.getLong("pv"), rs.getLong("uv"), rs.getLong("ip"));
          existing.put(d.day(), d);
        }, first.toString(), today.toString());
    List<Day> days = new ArrayList<>();
    for (LocalDate date=today; !date.isBefore(first); date=date.minusDays(1)) {
      String day = date.toString();
      days.add(existing.getOrDefault(day, new Day(day, 0, 0, 0)));
    }
    long total=days.stream().mapToLong(Day::pv).sum();
    return new Report(ZONE.getId(), days,buckets("hour",first,today,24),withMissing(buckets("country",first,today,300),total),
        buckets("region",first,today,40),withMissing(buckets("os",first,today,20),total),withMissing(buckets("browser",first,today,20),total),buckets("ip",first,today,10));
  }

  @Transactional(readOnly = true)
  public Visits visits(Instant now,String start,String end,int page) {
    if(page<1 || page>250) throw new AuthException(400,"INVALID_PAGE","页码不正确。");
    LocalDate[] range=range(now,start,end);
    String from=range[0].toString(),to=range[1].toString();
    long total=jdbc.queryForObject("SELECT count(*) FROM analytics_visits WHERE day>=? AND day<=?",Long.class,from,to);
    var rows=jdbc.query("SELECT * FROM analytics_visits WHERE day>=? AND day<=? ORDER BY id DESC LIMIT 20 OFFSET ?",
        (rs,i)->new Visit(rs.getLong("id"),rs.getString("occurred_at"),rs.getString("page"),rs.getString("ip_label"),
          rs.getString("country"),rs.getString("region"),rs.getString("os"),rs.getString("browser")),from,to,(page-1)*20);
    return new Visits(total,page,20,rows);
  }
  private void dimension(String day,String kind,String name) {
    jdbc.update("INSERT INTO analytics_dimensions VALUES (?,?,?,1) ON CONFLICT(day,kind,name) DO UPDATE SET pv=pv+1",day,kind,name);
  }
  private List<Bucket> buckets(String kind,LocalDate from,LocalDate to,int limit) {
    return jdbc.query("SELECT name,sum(pv) n FROM analytics_dimensions WHERE kind=? AND day>=? AND day<=? GROUP BY name ORDER BY n DESC,name LIMIT ?",
        (rs,i)->new Bucket(rs.getString(1),rs.getLong(2)),kind,from.toString(),to.toString(),limit);
  }
  private static List<Bucket> withMissing(List<Bucket> values,long total) {
    long missing=total-values.stream().mapToLong(Bucket::value).sum();
    if(missing<=0) return values;
    var result=new ArrayList<>(values);
    result.add(new Bucket("未采集",missing));
    result.sort(Comparator.comparingLong(Bucket::value).reversed().thenComparing(Bucket::name));
    return result;
  }
  private static LocalDate[] range(Instant now,String start,String end) {
    LocalDate today=now.atZone(ZONE).toLocalDate();
    try {
      LocalDate from=start==null ? today.minusDays(29) : LocalDate.parse(start);
      LocalDate to=end==null ? today : LocalDate.parse(end);
      if(from.isBefore(today.minusDays(29)) || to.isAfter(today) || from.isAfter(to)) throw new IllegalArgumentException();
      return new LocalDate[]{from,to};
    } catch(RuntimeException e) { throw new AuthException(400,"INVALID_DATE_RANGE","请选择最近 30 天内的日期范围。"); }
  }

  private static String hash(String secret, String value) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(HexFormat.of().parseHex(secret), "HmacSHA256"));
      return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
    } catch (java.security.GeneralSecurityException e) { throw new IllegalStateException("Analytics unavailable", e); }
  }
}
