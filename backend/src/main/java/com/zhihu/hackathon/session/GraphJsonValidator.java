package com.zhihu.hackathon.session;

import java.util.ArrayList;
import static com.zhihu.hackathon.session.Generation.*;

/** Model A: repair formatting and fill empty fields, then validate graph semantics. */
public final class GraphJsonValidator {
  public Graph validateAndRepair(String raw,String target) {
    var root=GeneratedJsonSupport.parse(raw);
    var nodes=new ArrayList<Node>();
    for (var item:GeneratedJsonSupport.array(root,"nodes")) {
      var node=GeneratedJsonSupport.object(item);
      nodes.add(new Node(GeneratedJsonSupport.id(node,"key"),GeneratedJsonSupport.text(node,"name"),GeneratedJsonSupport.text(node,"description")));
    }
    var edges=new ArrayList<Edge>();
    for (var item:GeneratedJsonSupport.array(root,"edges")) {
      var edge=GeneratedJsonSupport.object(item);
      edges.add(new Edge(GeneratedJsonSupport.id(edge,"from"),GeneratedJsonSupport.id(edge,"to")));
    }
    var graph=new Graph(nodes.stream().distinct().toList(),edges.stream().distinct().toList(),GeneratedJsonSupport.text(root,"targetDescription"));
    try { return new GraphValidator().validate(target,graph).graph(); }
    catch (IllegalArgumentException ex) { throw new ModelGenerationException("GRAPH_VALIDATION_FAILED",ex.getMessage()); }
  }
}
