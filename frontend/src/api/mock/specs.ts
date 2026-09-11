import type { ResourceStatus } from '../types'

export interface MockNodeDefinition {
  id: string
  name: string
  description: string
  reason: string
  questionText?: string
  resourceStatus?: ResourceStatus
}

export interface MockGraphDefinition {
  target: string
  nodes: MockNodeDefinition[]
  /** [前置节点, 后续节点] */
  edges: Array<[string, string]>
}

export const POPULAR_TARGETS = ['Transformer', 'RAG', 'Spring Boot']

const TRANSFORMER_GRAPH: MockGraphDefinition = {
  target: 'Transformer',
  nodes: [
    {
      id: 'matrix',
      name: '矩阵运算',
      description: '向量、矩阵与基本运算，包括矩阵乘法。',
      reason: 'Transformer 的注意力计算大量使用矩阵乘法，先熟悉它，读公式才不会卡住。',
      questionText: '你熟悉向量、矩阵和矩阵乘法吗？',
    },
    {
      id: 'probability',
      name: '概率与信息论',
      description: '概率分布、期望、信息量的基础概念。',
      reason: 'Softmax 会把注意力分数变成概率分布，理解概率能帮你读懂权重的含义。',
      questionText: '你了解 Softmax 为什么能把一组分数变成概率吗？',
      resourceStatus: 'EMPTY',
    },
    {
      id: 'nn',
      name: '神经网络基础',
      description: '层、激活函数、前向传播的基本直觉。',
      reason: '注意力是神经网络中的一种结构，有神经网络基础后更容易理解它的作用。',
      questionText: '你了解神经网络里“层”和“前向传播”的概念吗？',
    },
    {
      id: 'embedding',
      name: '词向量与嵌入',
      description: '把词或 token 表示成稠密向量的方法。',
      reason: 'Transformer 的输入是向量序列而不是原文，嵌入概念决定了输入怎么来。',
      questionText: '你了解词嵌入（Embedding）和 One-Hot 的区别吗？',
    },
    {
      id: 'attention',
      name: '注意力机制 Attention',
      description: '让模型按相关性聚焦输入中不同位置的机制。',
      reason: '这是 Transformer 的核心思想，必须放在自注意力之前理解。',
      questionText: '你了解 Attention 如何用 Query 和 Key 计算相关性吗？',
    },
    {
      id: 'self-attention',
      name: '自注意力 Self-Attention',
      description: '序列内每个位置对序列其他位置计算注意力的结构。',
      reason: '多头自注意力是 Transformer 编码器的主体结构。',
      questionText: '你知道自注意力和普通注意力机制的区别吗？',
    },
    {
      id: 'transformer',
      name: 'Transformer',
      description: '基于自注意力与位置编码的序列建模架构。',
      reason: '这是你本次的学习目标，不需要答题。',
    },
  ],
  edges: [
    ['matrix', 'attention'],
    ['probability', 'attention'],
    ['nn', 'attention'],
    ['embedding', 'attention'],
    ['attention', 'self-attention'],
    ['self-attention', 'transformer'],
  ],
}

const RAG_GRAPH: MockGraphDefinition = {
  target: 'RAG',
  nodes: [
    {
      id: 'chunking',
      name: '文本切分与索引',
      description: '把长文档切块并建立可检索索引的方法。',
      reason: 'RAG 的第一步是让模型能先找到相关的资料片段。',
      questionText: '你了解文档切块（Chunking）的基本思路吗？',
    },
    {
      id: 'embedding',
      name: '向量与嵌入',
      description: '把文本变成向量，并用向量表示语义相似度。',
      reason: '向量检索是 RAG 判断“哪段资料最相关”的基础。',
      questionText: '你了解文本向量化和相似度检索吗？',
    },
    {
      id: 'vector-db',
      name: '向量数据库与检索',
      description: '存储向量并支持近似最近邻查询的数据库能力。',
      reason: 'RAG 需要从大量向量中快速找回相关片段。',
      questionText: '你了解向量数据库在检索中的角色吗？',
    },
    {
      id: 'prompt',
      name: '提示词工程',
      description: '如何把检索结果组织成模型可用的上下文。',
      reason: 'RAG 的最后一步是把资料与问题一起交给生成模型。',
      questionText: '你了解把外部资料放入提示词给模型的做法吗？',
    },
    {
      id: 'rag',
      name: 'RAG',
      description: '检索增强生成：先检索资料，再让模型基于资料回答。',
      reason: '这是你本次的学习目标，不需要答题。',
    },
  ],
  edges: [
    ['chunking', 'vector-db'],
    ['embedding', 'vector-db'],
    ['vector-db', 'rag'],
    ['prompt', 'rag'],
  ],
}

const SPRING_BOOT_GRAPH: MockGraphDefinition = {
  target: 'Spring Boot',
  nodes: [
    {
      id: 'java',
      name: 'Java 基础',
      description: '类、对象、集合、异常与常用语法。',
      reason: 'Spring Boot 是 Java 框架，读文档和示例都需要 Java 基础。',
      questionText: '你能独立阅读并运行 Java 代码吗？',
    },
    {
      id: 'http',
      name: 'HTTP 与 REST',
      description: '请求方法、状态码、URL 与资源化接口设计。',
      reason: 'Spring Boot 最常见的用途是写 REST 接口，先理解 HTTP 请求是什么。',
      questionText: '你了解 GET / POST 与常见状态码的含义吗？',
    },
    {
      id: 'build',
      name: '构建工具基础',
      description: 'Maven / Gradle 的依赖与构建概念。',
      reason: 'Spring Boot 项目依赖构建工具管理第三方库与启动方式。',
      questionText: '你了解 Maven 或 Gradle 是怎么管理依赖的吗？',
    },
    {
      id: 'ioc',
      name: '依赖注入与容器',
      description: 'Bean、IoC 容器与依赖注入的基本思想。',
      reason: '这是理解 Spring Boot “自动配置”为什么省事的关键。',
      questionText: '你了解依赖注入（DI）和 IoC 容器吗？',
    },
    {
      id: 'spring-boot',
      name: 'Spring Boot',
      description: '简化 Spring 配置、可独立运行的应用框架。',
      reason: '这是你本次的学习目标，不需要答题。',
    },
  ],
  edges: [
    ['java', 'ioc'],
    ['ioc', 'spring-boot'],
    ['http', 'spring-boot'],
    ['build', 'spring-boot'],
  ],
}

function fallbackGraph(target: string): MockGraphDefinition {
  return {
    target,
    nodes: [
      {
        id: 'base-a',
        name: '基础概念',
        description: `与「${target}」相关的基础概念。`,
        reason: '学习新知识通常先补基础概念，Mock 数据用通用结构示意。',
        questionText: `你了解与「${target}」相关的基础概念吗？`,
      },
      {
        id: 'base-b',
        name: '核心铺垫',
        description: `连接基础与「${target}」的关键内容。`,
        reason: '这是通往目标知识的中间台阶。',
        questionText: `你了解「${target}」的核心铺垫内容吗？`,
      },
      {
        id: 'apply',
        name: '综合应用',
        description: `把前面内容组合起来解决真实问题。`,
        reason: '目标知识的直接前置。',
        questionText: `你能结合前面的知识理解「${target}」的应用场景吗？`,
      },
      {
        id: 'target',
        name: target,
        description: `本次想学习的目标知识。`,
        reason: '这是你本次的学习目标，不需要答题。',
      },
    ],
    edges: [
      ['base-a', 'apply'],
      ['base-b', 'apply'],
      ['apply', 'target'],
    ],
  }
}

export function buildMockGraph(target: string): MockGraphDefinition {
  const key = target.toLowerCase()
  if (key.includes('transformer')) return TRANSFORMER_GRAPH
  if (key === 'rag' || key.includes('检索增强')) return RAG_GRAPH
  if (key.includes('spring')) return SPRING_BOOT_GRAPH
  return fallbackGraph(target)
}
