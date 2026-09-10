package com.zhihu.hackathon.session;

import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;

public interface SessionStore {
  record Error(String code, String message) {}
  record Progress(int processedNodes, int totalNodes) {}
  record Warning(String nodeId, String code, String message) {}
  record Snapshot(String sessionId, String target, String status, Progress progress, List<Warning> warnings, Error error) {}
  long create(long userId, String target);
  Snapshot findOwned(long userId, long id);
  List<SavedNode> saveGraph(long id, String target, ValidGraph graph);
  void saveResources(long nodeId, List<Resource> resources, boolean failed);
  void generatingQuestions(long id);
  void ready(long id, List<Question> questions);
  void fail(long id, String code, String message);
  void recoverInterrupted();
  QuestionsResponse findQuestionsOwned(long userId , long sessionId);
  AnswerResponse saveAnswerOwned(long userId, long sessionId, long questionId, String answer);
}
