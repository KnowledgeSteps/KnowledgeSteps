package com.zhihu.hackathon.session;

public record AnswerResponse(
    String questionId,
    String masteryStatus,
    int answeredCount,
    int totalQuestions
) {}
