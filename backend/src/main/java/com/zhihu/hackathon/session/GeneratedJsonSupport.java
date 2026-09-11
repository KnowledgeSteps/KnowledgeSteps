package com.zhihu.hackathon.session;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.json.JsonReadFeature;

/** Bounded syntax repair; never guess truncated content or ambiguous duplicate keys. */
final class GeneratedJsonSupport {
  private static final ObjectMapper JSON = new ObjectMapper()
      .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
      .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
      .enable(JsonReadFeature.ALLOW_TRAILING_COMMA.mappedFeature())
      .enable(JsonReadFeature.ALLOW_SINGLE_QUOTES.mappedFeature())
      .enable(JsonReadFeature.ALLOW_UNQUOTED_FIELD_NAMES.mappedFeature())
      .enable(JsonReadFeature.ALLOW_JAVA_COMMENTS.mappedFeature());
  static ObjectNode parse(String raw) {
    try {
      if (raw == null || raw.length() > 1_000_000) throw new IllegalArgumentException();
      String text = raw.strip();
      if (text.startsWith("\uFEFF")) text=text.substring(1).strip();
      if (text.startsWith("```")) {
        int newline=text.indexOf('\n');
        if (newline < 0 || !text.endsWith("```")) throw new IllegalArgumentException();
        String language=text.substring(3,newline).strip();
        if (!language.isEmpty() && !language.equalsIgnoreCase("json")) throw new IllegalArgumentException();
        text=text.substring(newline+1,text.length()-3).strip();
      }
      JsonNode node=JSON.readTree(text);
      if (!(node instanceof ObjectNode object)) throw new IllegalArgumentException();
      return object;
    } catch (Exception ex) { throw new ModelGenerationException("MODEL_JSON_PARSE_ERROR"); }
  }
  static ArrayNode array(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    if (value==null || value.isNull()) return JSON.createArrayNode();
    if (!(value instanceof ArrayNode array)) throw new ModelGenerationException("MODEL_JSON_PARSE_ERROR");
    return array;
  }
  static ObjectNode object(JsonNode value) {
    if (!(value instanceof ObjectNode object)) throw new ModelGenerationException("MODEL_JSON_PARSE_ERROR");
    return object;
  }
  static String text(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    if (value==null || value.isNull()) return "";
    if (!value.isTextual()) throw new ModelGenerationException("MODEL_JSON_PARSE_ERROR");
    return value.textValue().strip();
  }
  static String id(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    return value!=null && value.isIntegralNumber() ? value.asText() : text(object,key);
  }
  private GeneratedJsonSupport() {}
}
