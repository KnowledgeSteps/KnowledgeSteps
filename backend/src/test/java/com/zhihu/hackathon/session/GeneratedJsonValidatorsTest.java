package com.zhihu.hackathon.session;

import org.junit.jupiter.api.Test;
import java.util.List;
import static org.assertj.core.api.Assertions.*;
import static com.zhihu.hackathon.session.Generation.*;

class GeneratedJsonValidatorsTest {
  final GraphJsonValidator graph=new GraphJsonValidator();
  final QuestionJsonValidator questions=new QuestionJsonValidator();
  final List<SavedNode> nodes=List.of(new SavedNode("1","矩阵",""));
  @Test void repairsGraphSyntaxAndFillsMissingDescriptions() {
    var result=graph.validateAndRepair("""
        ```json
        {nodes:[{key:'n1',name:'矩阵',extra:'ignored',},],edges:[{from:'n1',to:'target'}],}
        ```
        ""","Transformer");
    assertThat(result.targetDescription()).isEmpty();
    assertThat(result.nodes().getFirst().description()).isEmpty();
    assertThat(result.nodes().getFirst().name()).isEqualTo("矩阵");
  }
  @Test void fillsAbsentCollectionsWithoutInventingNodes() {
    assertThat(graph.validateAndRepair("{}","X").nodes()).isEmpty();
    assertThat(questions.validateAndRepair("{questions:null}",List.of())).isEmpty();
  }
  @Test void repairsQuestionIdsAndMissingHint() {
    var result=questions.validateAndRepair("{questions:[{nodeId:1,questionText:'你了解矩阵吗？',},]}",nodes);
    assertThat(result.getFirst().nodeId()).isEqualTo("1");
    assertThat(result.getFirst().hint()).isEmpty();
  }
  @Test void preservesEscapesInsideText() {
    var result=questions.validateAndRepair("""
        {"questions":[{"nodeId":"1","questionText":"你了解 https://example.com/a 吗？","hint":"括号 },] 不应改写"}]}
        """,nodes);
    assertThat(result.getFirst().hint()).isEqualTo("括号 },] 不应改写");
  }
  @Test void rejectsAmbiguousOrTruncatedJson() {
    for(var raw:List.of("{", "{} {}", "{nodes:[],nodes:[]}", "{nodes:{}}", "{nodes:[null]}"))
      assertThatThrownBy(()->graph.validateAndRepair(raw,"X")).hasMessage("MODEL_JSON_PARSE_ERROR");
  }
  @Test void doesNotInventRelationsOrRequiredContent() {
    assertThatThrownBy(()->graph.validateAndRepair("{nodes:[{key:'a',name:'A'}]}","X")).hasMessage("GRAPH_VALIDATION_FAILED");
    assertThatThrownBy(()->graph.validateAndRepair("{nodes:[{key:'a'}],edges:[{from:'a',to:'target'}]}","X")).hasMessage("GRAPH_VALIDATION_FAILED");
    assertThatThrownBy(()->questions.validateAndRepair("{}",nodes)).hasMessage("QUESTION_VALIDATION_FAILED");
    assertThatThrownBy(()->questions.validateAndRepair("{questions:[{nodeId:1}]}",nodes)).hasMessage("QUESTION_VALIDATION_FAILED");
    assertThatThrownBy(()->questions.validateAndRepair("{questions:[{nodeId:2,questionText:'Q'}]}",nodes)).hasMessage("QUESTION_VALIDATION_FAILED");
  }
}
