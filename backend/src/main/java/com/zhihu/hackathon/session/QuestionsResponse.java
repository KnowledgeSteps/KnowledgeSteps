package com.zhihu.hackathon.session;

import java.util.List;
import java.util.Map;

public record QuestionsResponse(List<QuestionItem> questions) {

    public record QuestionItem(
            String questionId,
            String nodeId,
            String nodeName,
            String questionText,
            String hint,
            List<Option> options,
            Map<String, ConceptCheckItem> checks,
            String answer
    ) {}

    public record ConceptCheckItem(String statement, boolean expected, String explanation) {}

    public record Option(String value, String label) {}

    public static final List<Option> FIXED_OPTIONS = List.of(
            new Option("VERY_FAMILIAR", "非常了解"),
            new Option("BASICALLY_KNOW", "基本了解"),
            new Option("HEARD_OF", "听说过"),
            new Option("DONT_KNOW", "不了解")
    );
}
