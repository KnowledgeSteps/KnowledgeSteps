package com.zhihu.hackathon.reading;

/** 测试替换此边界，禁止回归测试调用远程模型。 */
public interface ReadingModel {
  String overview(String target, String nodeName, String description, String familiarity);
  String explain(String target, String nodeName, String quote, String context);
}
