package com.zhihu.hackathon.session;

import java.util.List;
import java.util.Map;

/** 生成端口使用领域数据，不依赖 HTTP、SQLite 或模型供应商。 */
public final class Generation {
  private Generation() {}
  public record Node(String key, String name, String description) {}
  public record Edge(String from, String to) {}
  public record Graph(List<Node> nodes, List<Edge> edges, String targetDescription) {}
  public record ValidGraph(Graph graph, Map<String, Integer> levels) {}
  public record SavedNode(String id, String name, String description) {}
  public record ConceptCheck(String statement, boolean expected, String explanation) {}
  public record Question(String nodeId, String questionText, String hint,
                         ConceptCheck heardOfCheck, ConceptCheck basicallyKnowCheck, ConceptCheck veryFamiliarCheck) {
    public Question(String nodeId, String questionText, String hint) {
      this(nodeId, questionText, hint, null, null, null);
    }
  }
  public record Resource(String title, String url, String summary, String authorName, Long voteCount, String contentDate,
                         String recommendationReason) {
    public Resource(String title, String url, String summary, String authorName, Long voteCount, String contentDate) {
      this(title, url, summary, authorName, voteCount, contentDate, null);
    }
    public Resource(String title, String url, String summary, String authorName, Long voteCount) {
      this(title, url, summary, authorName, voteCount, null, null);
    }
  }
  public interface GraphGenerator { Graph generateGraph(String target); }
  public interface QuestionGenerator { List<Question> generateQuestions(List<SavedNode> nodes); }
  public interface ResourceSearch { List<Resource> search(String name, int count); }
  public interface ResourceRecommender { List<Resource> recommend(String nodeName, List<Resource> resources); }
}
