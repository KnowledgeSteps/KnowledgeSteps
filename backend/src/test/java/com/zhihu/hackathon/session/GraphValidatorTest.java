package com.zhihu.hackathon.session;

import org.junit.jupiter.api.Test;
import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;
import static org.assertj.core.api.Assertions.*;

class GraphValidatorTest {
  private final GraphValidator validator=new GraphValidator();
  private final List<Node> nodes=List.of(new Node("a","矩阵","用途"),new Node("b","概率","用途"));
  @Test void preservesBranchesAndComputesLevels() {
    var valid=validator.validate("Transformer",new Graph(nodes,List.of(new Edge("a","target"),new Edge("b","target"))));
    assertThat(valid.levels()).containsEntry("a",0).containsEntry("b",0).containsEntry("target",1);
    assertThat(valid.graph().edges()).hasSize(2);
  }
  @Test void rejectsCycles() { reject(List.of(new Edge("a","b"),new Edge("b","a"),new Edge("b","target"))); }
  @Test void rejectsDisconnectedNodes() { reject(List.of(new Edge("a","target"))); }
  @Test void rejectsUnknownReferences() { reject(List.of(new Edge("a","x"),new Edge("b","target"))); }
  @Test void rejectsDuplicateEdges() { reject(List.of(new Edge("a","target"),new Edge("a","target"),new Edge("b","target"))); }
  @Test void rejectsNormalizedDuplicateNames() {
    assertThatThrownBy(() -> validator.validate("X",new Graph(List.of(new Node("a","Ａ","why"),new Node("b","a","why")),List.of())))
        .isInstanceOf(IllegalArgumentException.class);
  }
  @Test void allowsNoPrerequisites() {
    assertThat(validator.validate("X",new Graph(List.of(),List.of())).levels()).containsEntry("target",0);
  }
  @Test void rejectsWrongQuestionCoverage() {
    var saved=List.of(new SavedNode("1","A","why"),new SavedNode("2","B","why"));
    assertThatThrownBy(() -> validator.validateQuestions(saved,List.of(new Question("1","Q",null),new Question("1","Q",null))))
        .isInstanceOf(IllegalArgumentException.class);
  }
  private void reject(List<Edge> edges) {
    assertThatThrownBy(() -> validator.validate("Transformer",new Graph(nodes,edges))).isInstanceOf(IllegalArgumentException.class);
  }
}
