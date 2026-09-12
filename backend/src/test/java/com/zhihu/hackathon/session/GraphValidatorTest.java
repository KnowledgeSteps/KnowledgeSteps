package com.zhihu.hackathon.session;

import org.junit.jupiter.api.Test;
import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;
import static org.assertj.core.api.Assertions.*;

class GraphValidatorTest {
  private final GraphValidator validator=new GraphValidator();
  private final List<Node> nodes=List.of(new Node("a","矩阵","用途"),new Node("b","概率","用途"));
  @Test void preservesBranchesAndComputesLevels() {
    var valid=validator.validate("Transformer",new Graph(nodes,List.of(new Edge("a","target"),new Edge("b","target")), "目标的具体介绍"));
    assertThat(valid.levels()).containsEntry("a",0).containsEntry("b",0).containsEntry("target",1);
    assertThat(valid.graph().edges()).hasSize(2);
  }
  @Test void validatesAndPreservesTargetDescription() {
    assertThat(validator.validate("X",new Graph(List.of(),List.of(),"  目标介绍  ")).graph().targetDescription()).isEqualTo("目标介绍");
    for (String description : new String[]{"a".repeat(1001)}) {
      assertThatThrownBy(() -> validator.validate("X",new Graph(List.of(),List.of(),description)))
          .isInstanceOf(IllegalArgumentException.class);
    }
  }
  @Test void rejectsCycles() { reject(List.of(new Edge("a","b"),new Edge("b","a"),new Edge("b","target"))); }
  @Test void rejectsDisconnectedNodes() { reject(List.of(new Edge("a","target"))); }
  @Test void rejectsUnknownReferences() { reject(List.of(new Edge("a","x"),new Edge("b","target"))); }
  @Test void rejectsDuplicateEdges() { reject(List.of(new Edge("a","target"),new Edge("a","target"),new Edge("b","target"))); }
  @Test void rejectsNormalizedDuplicateNames() {
    assertThatThrownBy(() -> validator.validate("X",new Graph(List.of(new Node("a","Ａ","why"),new Node("b","a","why")),List.of(), "目标的具体介绍")))
        .isInstanceOf(IllegalArgumentException.class);
  }
  @Test void allowsNoPrerequisites() {
    assertThat(validator.validate("X",new Graph(List.of(),List.of(), "目标的具体介绍")).levels()).containsEntry("target",0);
  }
  @Test void rejectsWrongQuestionCoverage() {
    var saved=List.of(new SavedNode("1","A","why"),new SavedNode("2","B","why"));
    assertThatThrownBy(() -> validator.validateQuestions(saved,List.of(new Question("1","Q",null),new Question("1","Q",null))))
        .isInstanceOf(IllegalArgumentException.class);
  }
  @Test void countsTargetWithoutRejectingValidDeepGraphs() {
    assertThat(validator.validate("X",chain(4)).levels()).containsEntry("target",4);
    assertThat(validator.validate("X",chain(5)).levels()).containsEntry("target",5);
  }
  @Test void shortcutDoesNotHideAnOverlongDependencyPath() {
    var graph=chain(5);
    var edges=new java.util.ArrayList<>(graph.edges());
    edges.add(new Edge("n0","target"));
    assertThat(validator.validate("X",new Graph(graph.nodes(),edges,"")).levels()).containsEntry("target",5);
  }
  @Test void preservesDeepAndWideValidGraphs() {
    assertThat(validator.validate("X",chain(15)).levels()).containsEntry("target",15);
    var graph=chain(15);
    var edges=graph.nodes().stream().map(n->new Edge(n.key(),"target")).toList();
    assertThat(validator.validate("X",new Graph(graph.nodes(),edges,"")).levels()).containsEntry("target",1);
    // Larger graphs retain their existing policy; no implicit extension of the requested limit.
    assertThat(validator.validate("X",chain(16)).graph().nodes()).hasSize(16);
  }
  private Graph chain(int count) {
    var nodes=new java.util.ArrayList<Node>();
    var edges=new java.util.ArrayList<Edge>();
    for(int i=0;i<count;i++) {
      nodes.add(new Node("n"+i,"知识"+i,""));
      edges.add(new Edge("n"+i,i==count-1 ? "target" : "n"+(i+1)));
    }
    return new Graph(nodes,edges,"");
  }
  private void reject(List<Edge> edges) {
    assertThatThrownBy(() -> validator.validate("Transformer",new Graph(nodes,edges, "目标的具体介绍"))).isInstanceOf(IllegalArgumentException.class);
  }
}
