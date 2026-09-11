package com.zhihu.hackathon.session;

import java.text.Normalizer;
import java.util.*;
import static com.zhihu.hackathon.session.Generation.*;

/** target 为保留的临时标识；模型只返回前置节点，目标由后端加入。 */
public class GraphValidator {
  public ValidGraph validate(String target, Graph input) {
    if (input == null || input.nodes() == null || input.edges() == null
        || input.nodes().size() > 20 || input.edges().size() > 210) invalid();
    String targetDescription = normalize(input.targetDescription());
    if (targetDescription.length() > 1000) invalid();
    Map<String, Node> nodes = new LinkedHashMap<>();
    Set<String> names = new HashSet<>();
    names.add(normalize(target).toLowerCase(Locale.ROOT));
    for (Node n : input.nodes()) {
      if (n == null || n.key() == null || !n.key().matches("[a-zA-Z0-9_-]{1,40}") || n.key().equals("target")) invalid();
      String name = normalize(n.name());
      String description = normalize(n.description());
      if (name.isEmpty() || name.length() > 100 || description.length() > 1000
          || !names.add(name.toLowerCase(Locale.ROOT)) || nodes.containsKey(n.key())) invalid();
      nodes.put(n.key(), new Node(n.key(), name, description));
    }
    Set<String> keys = new HashSet<>(nodes.keySet());
    keys.add("target");
    Map<String, Set<String>> next = new HashMap<>();
    Map<String, Integer> degree = new HashMap<>();
    Map<String, Integer> levels = new HashMap<>();
    for (String key : keys) { next.put(key, new HashSet<>()); degree.put(key, 0); levels.put(key, 0); }
    for (Edge e : input.edges()) {
      if (e == null || !keys.contains(e.from()) || !keys.contains(e.to()) || e.from().equals(e.to())
          || e.from().equals("target") || !next.get(e.from()).add(e.to())) invalid();
      degree.merge(e.to(), 1, Integer::sum);
    }
    // 在有向无环图中，唯一汇点为 target 即保证所有前置节点可达目标。
    for (String key : nodes.keySet()) if (next.get(key).isEmpty()) invalid();
    ArrayDeque<String> queue = new ArrayDeque<>();
    degree.forEach((key, count) -> { if (count == 0) queue.add(key); });
    int visited = 0;
    while (!queue.isEmpty()) {
      String key = queue.remove(); visited++;
      for (String child : next.get(key)) {
        levels.put(child, Math.max(levels.get(child), levels.get(key) + 1));
        if (degree.merge(child, -1, Integer::sum) == 0) queue.add(child);
      }
    }
    if (visited != keys.size()) invalid();
    return new ValidGraph(new Graph(List.copyOf(nodes.values()), List.copyOf(input.edges()), targetDescription), Map.copyOf(levels));
  }

  public List<Question> validateQuestions(List<SavedNode> nodes, List<Question> questions) {
    if (questions == null || questions.size() != nodes.size()) invalid();
    Set<String> remaining = new HashSet<>();
    nodes.forEach(n -> remaining.add(n.id()));
    Map<String, Question> byId = new HashMap<>();
    for (Question q : questions) {
      if (q == null || !remaining.remove(q.nodeId()) || q.questionText() == null
          || q.questionText().isBlank() || q.questionText().length() > 1000
          || (q.hint() != null && q.hint().length() > 1000)) invalid();
      byId.put(q.nodeId(), q);
    }
    return nodes.stream().map(n -> byId.get(n.id())).toList();
  }

  private static String normalize(String s) { return s == null ? "" : Normalizer.normalize(s, Normalizer.Form.NFKC).strip(); }
  private static void invalid() { throw new IllegalArgumentException("INVALID_GENERATED_STRUCTURE"); }
}
