import { ensureCurrentUser, invalidateCurrentUser, isCurrentAuthentication, refreshAfterCsrfFailure } from '../auth'
import { apiJson } from '../http'
import { ApiError } from '../types'
import type {
  AnswerSaveResult,
  AnswerValue,
  CompletionResult,
  GraphEdge,
  KnowledgeNode,
  LearningResource,
  NodeResources,
  Question,
  QuestionOption,
  ResourceStatus,
  SessionDetail,
  SessionError,
  SessionProgress,
  SessionStatus,
  SessionWarning,
} from '../types'
import {
  arrayValue,
  booleanValue,
  enumValue,
  nullableNumber,
  nullableObject,
  nullableString,
  numberValue,
  objectValue,
  stringValue,
} from '../validators'

const SESSION_STATUSES = [
  'GENERATING_GRAPH',
  'SEARCHING_RESOURCES',
  'GENERATING_QUESTIONS',
  'READY',
  'COMPLETED',
  'FAILED',
] as const

const ANSWER_VALUES = [
  'VERY_FAMILIAR',
  'BASICALLY_KNOW',
  'HEARD_OF',
  'DONT_KNOW',
] as const

const MASTERY_STATUSES = ['UNKNOWN', 'MASTERED', 'TO_LEARN'] as const

const RESOURCE_STATUSES = [
  'PENDING',
  'READY',
  'EMPTY',
  'FAILED',
  'NOT_APPLICABLE',
] as const

function parseProgress(value: unknown): SessionProgress {
  const record = objectValue(value)
  return {
    processedNodes: numberValue(record.processedNodes),
    totalNodes: numberValue(record.totalNodes),
  }
}

function parseSessionError(record: Record<string, unknown>): SessionError {
  return {
    code: stringValue(record.code),
    message: stringValue(record.message),
  }
}

function parseWarning(value: unknown): SessionWarning {
  const record = objectValue(value)
  return {
    nodeId: stringValue(record.nodeId),
    code: stringValue(record.code),
    message: stringValue(record.message),
  }
}

function parseSessionDetail(value: unknown): SessionDetail {
  const record = objectValue(value)
  return {
    sessionId: stringValue(record.sessionId),
    target: stringValue(record.target),
    status: enumValue(record.status, SESSION_STATUSES) as SessionStatus,
    progress: parseProgress(record.progress),
    warnings: arrayValue(record.warnings, parseWarning),
    error: nullableObject(record.error, parseSessionError),
  }
}

function parseQuestionOption(value: unknown): QuestionOption {
  const record = objectValue(value)
  return {
    value: enumValue(record.value, ANSWER_VALUES) as AnswerValue,
    label: stringValue(record.label),
  }
}

function parseQuestion(value: unknown): Question {
  const record = objectValue(value)
  return {
    questionId: stringValue(record.questionId),
    nodeId: stringValue(record.nodeId),
    nodeName: stringValue(record.nodeName),
    questionText: stringValue(record.questionText),
    hint: nullableString(record.hint),
    options: arrayValue(record.options, parseQuestionOption),
    answer:
      record.answer === null
        ? null
        : (enumValue(record.answer, ANSWER_VALUES) as AnswerValue),
  }
}

function parseQuestionsResponse(value: unknown): { questions: Question[] } {
  const record = objectValue(value)
  return {
    questions: arrayValue(record.questions, parseQuestion),
  }
}

function parseCreateResponse(value: unknown): {
  sessionId: string
  status: SessionStatus
} {
  const record = objectValue(value)
  return {
    sessionId: stringValue(record.sessionId),
    status: enumValue(record.status, SESSION_STATUSES) as SessionStatus,
  }
}

function parseAnswerSaveResult(value: unknown): AnswerSaveResult {
  const record = objectValue(value)
  return {
    questionId: stringValue(record.questionId),
    masteryStatus: enumValue(record.masteryStatus, MASTERY_STATUSES),
    answeredCount: numberValue(record.answeredCount),
    totalQuestions: numberValue(record.totalQuestions),
  }
}

function parseNode(value: unknown): KnowledgeNode {
  const record = objectValue(value)
  return {
    id: stringValue(record.id),
    name: stringValue(record.name),
    isTarget: booleanValue(record.isTarget),
    level: numberValue(record.level),
    answer: record.answer === null ? null : enumValue(record.answer, ANSWER_VALUES),
    resourceLimit: numberValue(record.resourceLimit),
  }
}

function parseEdge(value: unknown): GraphEdge {
  const record = objectValue(value)
  return {
    from: stringValue(record.from),
    to: stringValue(record.to),
  }
}

function parseCompletionResult(value: unknown): CompletionResult {
  const record = objectValue(value)
  return {
    sessionId: stringValue(record.sessionId),
    status: enumValue(record.status, ['COMPLETED', 'SEARCHING_RESOURCES'] as const),
    target: stringValue(record.target),
    missingCount: numberValue(record.missingCount),
    nodes: arrayValue(record.nodes, parseNode),
    edges: arrayValue(record.edges, parseEdge),
  }
}

function parseResource(value: unknown): LearningResource {
  const record = objectValue(value)
  return {
    id: stringValue(record.id),
    title: stringValue(record.title),
    url: stringValue(record.url),
    summary: nullableString(record.summary),
    authorName: nullableString(record.authorName),
    voteCount: nullableNumber(record.voteCount),
  }
}

function parseNodeResources(value: unknown): NodeResources {
  const record = objectValue(value)
  return {
    nodeId: stringValue(record.nodeId),
    nodeName: stringValue(record.nodeName),
    reason: stringValue(record.reason),
    resourceStatus: enumValue(record.resourceStatus, RESOURCE_STATUSES) as ResourceStatus,
    resources: arrayValue(record.resources, parseResource),
  }
}

async function request<T>(
  path: string,
  options: Parameters<typeof apiJson<T>>[1],
  validate: Parameters<typeof apiJson<T>>[2],
  csrf = false,
): Promise<T> {
  const user = await ensureCurrentUser()
  const headers = new Headers(options.headers)
  if (csrf) headers.set('X-CSRF-Token', user.csrfToken)
  try {
    const result = await apiJson(path, { ...options, headers }, validate)
    if (!isCurrentAuthentication(user)) {
      throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
    }
    return result
  } catch (error) {
    if (!isCurrentAuthentication(user)) {
      throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
    }
    if (error instanceof ApiError && error.status === 401) invalidateCurrentUser(user)
    if (csrf && isCurrentAuthentication(user)) await refreshAfterCsrfFailure(error)
    throw error
  }
}

export async function createSession(target: string): Promise<{
  sessionId: string
  status: SessionStatus
}> {
  return request(
    '/api/v1/learning-sessions',
    { method: 'POST', body: { target } },
    parseCreateResponse,
    true,
  )
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  return request(
    `/api/v1/learning-sessions/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    parseSessionDetail,
  )
}

export async function getQuestions(
  sessionId: string,
): Promise<{ questions: Question[] }> {
  return request(
    `/api/v1/learning-sessions/${encodeURIComponent(sessionId)}/questions`,
    { method: 'GET' },
    parseQuestionsResponse,
  )
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<AnswerSaveResult> {
  return request(
    `/api/v1/learning-sessions/${encodeURIComponent(sessionId)}/answers/${encodeURIComponent(questionId)}`,
    { method: 'PUT', body: { answer } },
    parseAnswerSaveResult,
    true,
  )
}

export async function completeSession(
  sessionId: string,
): Promise<CompletionResult> {
  return request(
    `/api/v1/learning-sessions/${encodeURIComponent(sessionId)}/complete`,
    { method: 'POST' },
    parseCompletionResult,
    true,
  )
}

export async function getNodeResources(
  sessionId: string,
  nodeId: string,
): Promise<NodeResources> {
  return request(
    `/api/v1/learning-sessions/${encodeURIComponent(sessionId)}/nodes/${encodeURIComponent(nodeId)}/resources`,
    { method: 'GET' },
    parseNodeResources,
  )
}
