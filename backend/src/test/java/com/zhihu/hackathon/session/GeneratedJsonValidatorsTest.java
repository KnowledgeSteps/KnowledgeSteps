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
  @Test void rejectsDuplicateNodesAndEdgesRatherThanSilentlyChangingTheGraph() {
    for(var raw:List.of(
        "{nodes:[{key:'a',name:'A'},{key:'a',name:'A'}],edges:[{from:'a',to:'target'}]}",
        "{nodes:[{key:'a',name:'A'},{key:'a',name:'B'}],edges:[{from:'a',to:'target'}]}",
        "{nodes:[{key:'a',name:'A'}],edges:[{from:'a',to:'target'},{from:'a',to:'target'}]}"))
      assertThatThrownBy(()->graph.validateAndRepair(raw,"X")).hasMessage("GRAPH_VALIDATION_FAILED");
  }
  @Test void requiresExplicitCollectionsEvenForAnEmptyGraphOrQuestionList() {
    assertThat(graph.validateAndRepair("{nodes:[],edges:[]}","X").nodes()).isEmpty();
    assertThat(questions.validateAndRepair("{questions:[]}",List.of())).isEmpty();
    assertThatThrownBy(()->graph.validateAndRepair("{}","X")).hasMessage("MODEL_JSON_PARSE_ERROR");
    assertThatThrownBy(()->questions.validateAndRepair("{questions:null}",List.of())).hasMessage("MODEL_JSON_PARSE_ERROR");
  }
  @Test void repairsQuestionIdsAndMissingHint() {
    var result=questions.validateAndRepair("{questions:[{nodeId:1,questionText:'你了解矩阵吗？',heardOfCheck:{statement:'矩阵是一种数学对象',expected:true,explanation:'矩阵按行列组织元素'},basicallyKnowCheck:{statement:'矩阵乘法总能交换顺序',expected:false,explanation:'矩阵乘法通常不满足交换律'},veryFamiliarCheck:{statement:'可逆方阵的秩等于其阶数',expected:true,explanation:'满秩方阵可逆'}}]}",nodes);
    assertThat(result.getFirst().nodeId()).isEqualTo("1");
    assertThat(result.getFirst().hint()).isEmpty();
  }
  @Test void preservesEscapesInsideText() {
    var result=questions.validateAndRepair("""
        {"questions":[{"nodeId":"1","questionText":"你了解 https://example.com/a 吗？","hint":"括号 },] 不应改写","heardOfCheck":{"statement":"矩阵按行列排列元素","expected":true,"explanation":"这是矩阵的基本形式"},"basicallyKnowCheck":{"statement":"矩阵乘法总可交换","expected":false,"explanation":"通常不可交换"},"veryFamiliarCheck":{"statement":"可逆方阵满秩","expected":true,"explanation":"可逆等价于满秩"}}]}
        """,nodes);
    assertThat(result.getFirst().hint()).isEqualTo("括号 },] 不应改写");
  }
  @Test void rejectsAmbiguousOrTruncatedJson() {
    for(var raw:List.of("{", "{} {}", "{nodes:[],nodes:[]}", "{nodes:{}}", "{nodes:[null]}"))
      assertThatThrownBy(()->graph.validateAndRepair(raw,"X")).hasMessage("MODEL_JSON_PARSE_ERROR");
  }
  @Test void doesNotInventRelationsOrRequiredContent() {
    assertThatThrownBy(()->graph.validateAndRepair("{nodes:[{key:'a',name:'A'}]}","X")).hasMessage("MODEL_JSON_PARSE_ERROR");
    assertThatThrownBy(()->graph.validateAndRepair("{nodes:[{key:'a'}],edges:[{from:'a',to:'target'}]}","X")).hasMessage("MODEL_JSON_PARSE_ERROR");
    assertThatThrownBy(()->questions.validateAndRepair("{}",nodes)).hasMessage("MODEL_JSON_PARSE_ERROR");
    assertThatThrownBy(()->questions.validateAndRepair("{questions:[{nodeId:1}]}",nodes)).hasMessage("MODEL_JSON_PARSE_ERROR");
    assertThatThrownBy(()->questions.validateAndRepair("{questions:[{nodeId:2,questionText:'Q',heardOfCheck:{statement:'A',expected:true,explanation:'A'},basicallyKnowCheck:{statement:'B',expected:false,explanation:'B'},veryFamiliarCheck:{statement:'C',expected:true,explanation:'C'}}]}",nodes)).hasMessage("QUESTION_VALIDATION_FAILED");
  }
  @Test void syntaxDiagnosticContainsOnlyCategoryAndLocation() {
    var failure=catchThrowableOfType(()->graph.validateAndRepair("{private_user_data:","X"),ModelGenerationException.class);
    assertThat(failure.detail()).startsWith("JSON_INCOMPLETE_LINE_").doesNotContain("private_user_data");
    assertThat(failure.getCause()).isNull();
  }
}
