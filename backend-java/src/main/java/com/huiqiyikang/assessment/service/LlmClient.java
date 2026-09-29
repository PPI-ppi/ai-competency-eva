package com.huiqiyikang.assessment.service;

import java.util.List;

public interface LlmClient {
    record QuestionContext(Long id, String type, String title, String content,
                           String options, String answer, String rubric) {}

    record ChatTurn(String role, String content) {}

    record FollowupTurn(String ask, String answer) {}

    record ScoreResult(Integer score, Double r, String clarity, String comment) {}

    record FollowupDecision(boolean finished, String question,
                            List<FollowupTurn> turns, String endReason) {}

    record GeneratedQuestion(String type, String title, String content,
                             String options, String answer, String rubric,
                             Integer difficulty, List<String> tags,
                             List<String> assessmentPoints) {}

    ScoreResult score(QuestionContext question, String answerContent,
                      List<FollowupTurn> followupHistory);

    ScoreResult scoreSubmission(QuestionContext question, String finalSubmission,
                                List<ChatTurn> conversation,
                                List<FollowupTurn> followupHistory);

    String chat(QuestionContext question, List<ChatTurn> conversation, String userMessage);

    FollowupDecision followup(QuestionContext question, String originalAnswer,
                              List<FollowupTurn> followupHistory, int followupCount);

    String report(String reportDataJson);

    GeneratedQuestion generateSimilarQuestion(QuestionContext question, String instruction,
                                              List<String> tags, List<String> assessmentPoints,
                                              Integer difficulty);
}
