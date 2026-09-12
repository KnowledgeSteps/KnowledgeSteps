package com.zhihu.hackathon.session;

import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;
import org.springframework.http.HttpHeaders;

/** Bounded 429 retries with jitter; do not retry earlier than upstream Retry-After. */
final class ModelRateLimitBackoff {
  interface Sleeper { void sleep(long millis) throws InterruptedException; }
  private final Sleeper sleeper;
  ModelRateLimitBackoff() { this(Thread::sleep); }
  ModelRateLimitBackoff(Sleeper sleeper) { this.sleeper=sleeper; }
  void pause(int attempt,HttpHeaders headers) {
    long delay=1000L << attempt;
    String retry=headers==null ? null : headers.getFirst("Retry-After");
    if(retry!=null) {
      try { delay=Math.max(delay,Math.multiplyExact(Long.parseLong(retry.strip()),1000)); }
      catch(NumberFormatException ex) {
        try { delay=Math.max(delay,Duration.between(Instant.now(),ZonedDateTime.parse(retry,DateTimeFormatter.RFC_1123_DATE_TIME).toInstant()).toMillis()); }
        catch(java.time.format.DateTimeParseException ignored) { /* use bounded exponential delay */ }
      } catch(ArithmeticException ex) { throw new ModelGenerationException("MODEL_RATE_LIMITED"); }
    }
    if(delay>30_000) throw new ModelGenerationException("MODEL_RATE_LIMITED");
    try { sleeper.sleep(Math.min(30_000,delay+ThreadLocalRandom.current().nextLong(250,751))); }
    catch(InterruptedException ex) { Thread.currentThread().interrupt();throw new ModelGenerationException("GENERATION_INTERRUPTED"); }
  }
}
