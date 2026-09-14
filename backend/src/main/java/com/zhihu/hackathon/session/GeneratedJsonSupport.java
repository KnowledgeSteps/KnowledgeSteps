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
      if (raw == null || raw.isBlank()) throw invalid("JSON_EMPTY");
      if (raw.length() > 1_000_000) throw invalid("JSON_TOO_LARGE");
      String text = raw.strip();
      if (text.startsWith("\uFEFF")) text=text.substring(1).strip();
      if (text.startsWith("```")) {
        int newline=text.indexOf('\n');
        if (newline < 0 || !text.endsWith("```")) throw invalid("JSON_INCOMPLETE_FENCE");
        String language=text.substring(3,newline).strip();
        if (!language.isEmpty() && !language.equalsIgnoreCase("json")) throw invalid("JSON_UNSUPPORTED_FENCE");
        text=text.substring(newline+1,text.length()-3).strip();
      }
      JsonNode node=JSON.readTree(text);
      if (!(node instanceof ObjectNode object)) throw invalid("JSON_OBJECT_REQUIRED");
      return object;
    } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
      // Jackson messages can contain generated text; only a fixed category and numeric location are safe.
      String detail=ex instanceof com.fasterxml.jackson.core.io.JsonEOFException ? "JSON_INCOMPLETE" : "JSON_SYNTAX_INVALID";
      var location=ex.getLocation();
      if(location!=null) detail+="_LINE_"+location.getLineNr()+"_COLUMN_"+location.getColumnNr();
      throw invalid(detail);
    }
  }
  static ArrayNode array(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    if (!(value instanceof ArrayNode array)) throw invalid("REQUIRED_ARRAY_"+key);
    return array;
  }
  static ObjectNode object(JsonNode value) {
    if (!(value instanceof ObjectNode object)) throw invalid("ARRAY_ITEM_OBJECT_REQUIRED");
    return object;
  }
  static String text(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    if (value==null || value.isNull()) return "";
    if (!value.isTextual()) throw invalid("STRING_REQUIRED_"+key);
    return value.textValue().strip();
  }
  static String requiredText(ObjectNode object,String key) {
    String value=text(object,key);
    if(value.isBlank()) throw invalid("NONEMPTY_STRING_REQUIRED_"+key);
    return value;
  }
  static String id(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    return value!=null && value.isIntegralNumber() ? value.asText() : requiredText(object,key);
  }
  static boolean bool(ObjectNode object,String key) {
    JsonNode value=object.get(key);
    if(value==null || !value.isBoolean()) throw invalid("BOOLEAN_REQUIRED_"+key);
    return value.booleanValue();
  }
  private static ModelGenerationException invalid(String detail) { return new ModelGenerationException("MODEL_JSON_PARSE_ERROR",detail); }
  private GeneratedJsonSupport() {}
}
