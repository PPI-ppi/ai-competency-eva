package com.huiqiyikang.assessment.service;

import java.util.List;

public interface LlmClient {
    record QuestionContext(Long id, String type, String title, String content,
                           String options, String answer, String rubric) {}

    record FollowupTurn(String ask, String answer) {}

    record ScoreResult(Integer score, Double r, String clarity, String comment) {}

    record FollowupDecision(boolean finished, String question,
                            List<FollowupTurn> turns, String endReason) {}

    ScoreResult score(QuestionContext question, String answerContent,
                      List<FollowupTurn> followupHistory);

    FollowupDecision followup(QuestionContext question, String originalAnswer,
                              List<FollowupTurn> followupHistory, int followupCount);

    String report(String reportDataJson);
}
