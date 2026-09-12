package com.zhihu.hackathon.session;

import java.util.ArrayList;
import java.util.List;
import static com.zhihu.hackathon.session.Generation.*;

/** Model B: empty hints are safe; missing questions, text or node mappings are not. */
public final class QuestionJsonValidator {
  public List<Question> validateAndRepair(String raw,List<SavedNode> nodes) {
    var root=GeneratedJsonSupport.parse(raw);
    var questions=new ArrayList<Question>();
    for (var item:GeneratedJsonSupport.array(root,"questions")) {
      var question=GeneratedJsonSupport.object(item);
      questions.add(new Question(GeneratedJsonSupport.id(question,"nodeId"),
          GeneratedJsonSupport.text(question,"questionText"),GeneratedJsonSupport.text(question,"hint")));
    }
    try { return new GraphValidator().validateQuestions(nodes,questions); }
    catch (IllegalArgumentException ex) { throw new ModelGenerationException("QUESTION_VALIDATION_FAILED",ex.getMessage()); }
  }
}
