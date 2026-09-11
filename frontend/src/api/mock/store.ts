import {
  ApiError,
  MASTERED_VALUES,
  type AnswerValue,
  type CompletionResult,
  type GraphEdge,
  type KnowledgeNode,
  type LearningResource,
  type MasteryStatus,
  type NodeResources,
  type Question,
  type QuestionOption,
  type ResourceStatus,
  type SessionDetail,
  type SessionError,
  type SessionStatus,
} from '../types'
import { ANSWER_OPTIONS } from '../../constants/answerOptions'
import { buildMockGraph, type MockNodeDefinition } from './specs'

const STAGE_GRAPH_MS = 1300
const STAGE_SEARCH_MS = 1300
const STAGE_QUESTIONS_MS = 3900

interface StoredNode extends MockNodeDefinition {
  mastery: MasteryStatus
}

type StoredQuestion = Question

interface StoredResources {
  status: ResourceStatus
  items: LearningResource[]
}

interface InternalSession {
  id: string
  userId: string
  target: string
  createdAt: number
  mode: 'ACTIVE' | 'SEARCHING' | 'COMPLETED' | 'FAILED'
  resourcesStartedAt?: number
  resourcePolicyVersion?: number
  error: SessionError | null
  nodes: StoredNode[]
  edges: Array<[string, string]>
  questions: StoredQuestion[]
  resourcesByNode: Map<string, StoredResources>
  lastResult: CompletionResult | null
}

const sessions = new Map<string, InternalSession>()
const STORAGE_KEY = 'zhijie-mock-session-v3:'
const storageKey = (userId: string, id: string) => `${STORAGE_KEY}${encodeURIComponent(userId)}:${encodeURIComponent(id)}`

function persist(session: InternalSession): void {
  try {
    localStorage.setItem(storageKey(session.userId, session.id), JSON.stringify({
      ...session, resourcesByNode: Object.fromEntries(session.resourcesByNode),
    }))
  } catch {
    // Keep this task in memory when browser storage is unavailable.
  }
}

function restore(userId: string, id: string): void {
  try {
    const raw = localStorage.getItem(storageKey(userId, id))
    // Read owned v2 records for compatibility; never import the unowned v1 cache.
    const item = raw ? JSON.parse(raw) : JSON.parse(localStorage.getItem(`zhijie-mock-sessions-v2:${encodeURIComponent(userId)}`) ?? '[]')
      .find((value: InternalSession) => value.id === id && value.userId === userId)
    if (item?.userId !== userId || item.id !== id) return
    const restored: InternalSession = { ...item, resourcesByNode: new Map(Object.entries(item.resourcesByNode ?? {})) }
    if (restored.resourcePolicyVersion !== 1) {
      restored.resourcePolicyVersion = 1
      restored.lastResult = null
      if (restored.mode === 'COMPLETED') restored.mode = 'ACTIVE'
      for (const node of restored.nodes) {
        const answer = restored.questions.find(q => q.nodeId === node.id)?.answer ?? null
        node.mastery = answer ? answerStatus(answer) : 'UNKNOWN'
        restored.resourcesByNode.set(node.id, { status: isTargetNode(node) || answer === 'VERY_FAMILIAR' ? 'NOT_APPLICABLE' : 'PENDING', items: [] })
      }
    }
    sessions.set(`${userId}:${id}`, restored)
  } catch {
    // Storage unavailable or corrupt: retain any valid in-memory task.
  }
}


function error(status: number, code: string, message: string): ApiError {
  return new ApiError(status, code, message)
}

function findSession(userId: string, sessionId: string): InternalSession {
  restore(userId, sessionId)
  const session = sessions.get(`${userId}:${sessionId}`)
  if (!session) {
    throw error(404, 'NOT_FOUND', '任务不存在或不属于当前用户，请返回首页重新开始。')
  }
  return session
}

function statusOf(session: InternalSession): SessionStatus {
  if (session.mode === 'SEARCHING') {
    if (Date.now() - (session.resourcesStartedAt ?? 0) < STAGE_SEARCH_MS) return 'SEARCHING_RESOURCES'
    for (const node of session.nodes) {
      if (session.resourcesByNode.get(node.id)?.status === 'PENDING') {
        const answer = session.questions.find(q => q.nodeId === node.id)?.answer ?? null
        session.resourcesByNode.set(node.id, makeResources(node, resourceLimit(answer)))
      }
    }
    session.mode = 'COMPLETED'
    session.lastResult = buildResult(session)
    persist(session)
  }
  if (session.mode === 'COMPLETED') return 'COMPLETED'
  if (session.mode === 'FAILED') return 'FAILED'
  const elapsed = Date.now() - session.createdAt
  if (elapsed < STAGE_GRAPH_MS) return 'GENERATING_GRAPH'
  if (elapsed < STAGE_QUESTIONS_MS) return 'GENERATING_QUESTIONS'
  return 'READY'
}

function computeLevels(
  nodes: Array<{ id: string }>,
  edges: Array<[string, string]>,
): Map<string, number> {
  const parentsOf = new Map<string, string[]>()
  for (const [from, to] of edges) {
    const list = parentsOf.get(to) ?? []
    list.push(from)
    parentsOf.set(to, list)
  }
  const memo = new Map<string, number>()

  const levelOf = (id: string): number => {
    const cached = memo.get(id)
    if (cached !== undefined) return cached
    const parents = parentsOf.get(id) ?? []
    const level = parents.length
      ? Math.max(...parents.map((p) => levelOf(p))) + 1
      : 0
    memo.set(id, level)
    return level
  }

  for (const node of nodes) levelOf(node.id)
  return memo
}

function isTargetNode(node: MockNodeDefinition): boolean {
  return (
    node.id === 'transformer' ||
    node.id === 'rag' ||
    node.id === 'spring-boot' ||
    node.id === 'target'
  )
}

function createQuestions(nodes: StoredNode[]): StoredQuestion[] {
  const options: QuestionOption[] = ANSWER_OPTIONS
  const questions: StoredQuestion[] = []
  for (const node of nodes) {
    if (isTargetNode(node)) continue
    questions.push({
      questionId: `q-${node.id}`,
      nodeId: node.id,
      nodeName: node.name,
      questionText:
        node.questionText ?? `你了解「${node.name}」吗？`,
      hint: node.reason,
      options,
      answer: null,
    })
  }
  return questions
}

const resourceLimit = (answer: AnswerValue | null) => answer === 'BASICALLY_KNOW' ? 2 : answer === 'HEARD_OF' ? 3 : answer === 'DONT_KNOW' ? 5 : 0

function makeResources(node: StoredNode, count: number): StoredResources {
  if (isTargetNode(node) || count === 0) {
    return { status: 'NOT_APPLICABLE', items: [] }
  }
  if (node.resourceStatus === 'EMPTY' || node.resourceStatus === 'FAILED') {
    return { status: node.resourceStatus, items: [] }
  }
  const queries = [
    `${node.name} 是什么`,
    `如何入门 ${node.name}`,
    `${node.name} 学习路线`,
    `${node.name} 基础示例`,
    `${node.name} 常见问题`,
  ]
  const items: LearningResource[] = queries.slice(0, count).map((query, i) => ({
    id: `res-${node.id}-${i + 1}`,
    title: `${node.name} · 示例资料 ${i + 1}`,
    url: `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(query)}`,
    summary: `演示条目：在知乎检索「${query}」。接入真实接口后这里会展示搜索结果摘要，当前为本地 Mock 数据。`,
    authorName: null,
    voteCount: null,
  }))
  return { status: 'READY', items }
}

function publicDetail(session: InternalSession): SessionDetail {
  const status = statusOf(session)
  const totalNodes = session.nodes.filter((n) => !isTargetNode(n)).length
  const processedNodes = [...session.resourcesByNode.entries()].filter(([id, value]) => !isTargetNode(session.nodes.find(n => n.id === id)!) && value.status !== 'PENDING').length
  return {
    sessionId: session.id,
    target: session.target,
    status,
    progress: { processedNodes, totalNodes },
    warnings: [],
    error: session.error,
  }
}

function answerStatus(value: AnswerValue): MasteryStatus {
  return (MASTERED_VALUES as readonly AnswerValue[]).includes(value)
    ? 'MASTERED'
    : 'TO_LEARN'
}

function buildResult(session: InternalSession): CompletionResult {
  const toLearn = session.nodes.filter((n) => !isTargetNode(n) && n.mastery === 'TO_LEARN')
  const edges: GraphEdge[] = session.edges.map(([from, to]) => ({ from, to }))
  const baseLevels = computeLevels(session.nodes, session.edges)
  const nodes: KnowledgeNode[] = session.nodes
    .map((n) => ({
      id: n.id,
      name: n.name,
      isTarget: isTargetNode(n),
      level: baseLevels.get(n.id) ?? 0,
      answer: session.questions.find(q => q.nodeId === n.id)?.answer ?? null,
      resourceLimit: resourceLimit(session.questions.find(q => q.nodeId === n.id)?.answer ?? null),
    }))
    .sort((a, b) => {
      const aTarget = a.isTarget ? 1 : 0
      const bTarget = b.isTarget ? 1 : 0
      return a.level - b.level || aTarget - bTarget || a.name.localeCompare(b.name)
    })

  return {
    sessionId: session.id,
    status: session.mode === 'SEARCHING' ? 'SEARCHING_RESOURCES' : 'COMPLETED',
    target: session.target,
    missingCount: toLearn.length,
    nodes,
    edges,
  }
}

export function mockCreateSession(userId: string, rawTarget: string): {
  sessionId: string
  status: SessionStatus
} {
  const target = rawTarget.trim()
  if (!target || target.length > 100) {
    throw error(400, 'INVALID_TARGET', '学习目标需要在 1～100 个字符之间，请补充后重试。')
  }

  const graph = buildMockGraph(target)
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  const nodes: StoredNode[] = graph.nodes.map((n) => ({
    ...n,
    mastery: 'UNKNOWN',
  }))
  const session: InternalSession = {
    id,
    userId,
    target,
    createdAt: Date.now(),
    resourcePolicyVersion: 1,
    mode: 'ACTIVE',
    error: null,
    nodes,
    edges: graph.edges,
    questions: [],
    resourcesByNode: new Map(),
    lastResult: null,
  }
  session.questions = createQuestions(nodes)
  for (const node of nodes) {
    session.resourcesByNode.set(node.id, { status: isTargetNode(node) ? 'NOT_APPLICABLE' : 'PENDING', items: [] })
  }
  sessions.set(`${userId}:${id}`, session)
  persist(session)
  return { sessionId: id, status: 'GENERATING_GRAPH' }
}

export function mockGetSession(userId: string, sessionId: string): SessionDetail {
  return publicDetail(findSession(userId, sessionId))
}

export function mockGetQuestions(userId: string, sessionId: string): { questions: Question[] } {
  const session = findSession(userId, sessionId)
  const status = statusOf(session)
  if (status !== 'READY' && status !== 'COMPLETED') {
    throw error(409, 'SESSION_NOT_READY', '问卷还没准备好，请稍候再试。')
  }
  return { questions: session.questions.map((q) => ({ ...q })) }
}

export function mockSaveAnswer(
  userId: string,
  sessionId: string,
  questionId: string,
  value: AnswerValue,
) {
  const session = findSession(userId, sessionId)
  const status = statusOf(session)
  if (status !== 'READY' && status !== 'COMPLETED') {
    throw error(409, 'SESSION_NOT_READY', '问卷还没准备好，无法保存答案。')
  }
  const question = session.questions.find((q) => q.questionId === questionId)
  if (!question) throw error(404, 'NOT_FOUND', '题目不存在。')
  if (!ANSWER_OPTIONS.some((o) => o.value === value)) {
    throw error(400, 'INVALID_ANSWER', '答案不合法，请重新选择。')
  }

  const wasCompleted = session.mode === 'COMPLETED'
  const changed = question.answer !== value
  question.answer = value
  const node = session.nodes.find((n) => n.id === question.nodeId)
  if (node) {
    node.mastery = answerStatus(value)
    if (changed) session.resourcesByNode.set(node.id, { status: value === 'VERY_FAMILIAR' ? 'NOT_APPLICABLE' : 'PENDING', items: [] })
  }

  if (wasCompleted && changed) {
    session.mode = 'ACTIVE'
    session.lastResult = null
  }

  persist(session)
  return {
    questionId,
    masteryStatus: answerStatus(value),
    answeredCount: session.questions.filter((q) => q.answer !== null).length,
    totalQuestions: session.questions.length,
  }
}

export function mockCompleteSession(userId: string, sessionId: string): CompletionResult {
  const session = findSession(userId, sessionId)
  const status = statusOf(session)
  if (status === 'COMPLETED' && session.lastResult) {
    return session.lastResult
  }
  if (status === 'SEARCHING_RESOURCES') return buildResult(session)
  if (status !== 'READY') {
    throw error(409, 'SESSION_NOT_READY', '问卷还没准备好，无法查看结果。')
  }
  if (session.questions.some((q) => q.answer === null)) {
    throw error(409, 'ANSWERS_INCOMPLETE', '还有题目未作答，请完成后再查看结果。')
  }
  const pending = [...session.resourcesByNode.values()].some(r => r.status === 'PENDING')
  session.mode = pending ? 'SEARCHING' : 'COMPLETED'
  session.resourcesStartedAt = Date.now()
  const result = buildResult(session)
  session.lastResult = result
  persist(session)
  return result
}

export function mockGetNodeResources(
  userId: string,
  sessionId: string,
  nodeId: string,
): NodeResources {
  const session = findSession(userId, sessionId)
  if (statusOf(session) !== 'COMPLETED' || !session.lastResult) {
    throw error(409, 'SESSION_NOT_COMPLETED', '请先完成答卷再查看资料。')
  }
  const visible = session.lastResult.nodes.some((n) => n.id === nodeId)
  if (!visible) {
    throw error(404, 'NOT_FOUND', '该节点不在当前结果中。')
  }
  const node = session.nodes.find((n) => n.id === nodeId)
  if (!node) throw error(404, 'NOT_FOUND', '节点不存在。')
  const resources = session.resourcesByNode.get(nodeId) ?? {
    status: 'FAILED' as ResourceStatus,
    items: [],
  }
  return {
    nodeId,
    nodeName: node.name,
    reason: node.reason,
    resourceStatus: resources.status,
    resources: resources.items.map((r) => ({ ...r })),
  }
}
