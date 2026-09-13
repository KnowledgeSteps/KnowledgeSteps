import { ensureCurrentUser, isCurrentAuthentication, subscribeAuth } from './auth'
import { ResourceCache } from './resourceCache'
import { ApiError } from './types'
import type {
  AnswerSaveResult,
  AnswerValue,
  CompletionResult,
  NodeResources,
  Question,
  SessionDetail,
  SessionStatus,
} from './types'
import { isMockMode } from './config'
import {
  mockGetSessionHistory,
  mockDeleteSession,
  mockCompleteSession,
  mockCreateSession,
  mockGetNodeResources,
  mockGetQuestions,
  mockGetSession,
  mockSaveAnswer,
} from './mock/store'
import * as realSessions from './real/sessions'

const resourcesCache = new ResourceCache<NodeResources>()
const unsubscribeCache = subscribeAuth(() => resourcesCache.clear())
if (import.meta.hot) import.meta.hot.dispose(unsubscribeCache)

async function mockUser(ms: number, signal?: AbortSignal): Promise<string> {
  const user = await ensureCurrentUser()
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer)
      reject(new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。'))
    }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, ms)
    if (signal?.aborted) cancel()
    else signal?.addEventListener('abort', cancel, { once: true })
  })
  if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
  return user.userId
}

export async function createSession(target: string, requestKey?: string): Promise<{
  sessionId: string
  status: SessionStatus
}> {
  if (!isMockMode) return realSessions.createSession(target, requestKey)
  const userId = await mockUser(320)
  return mockCreateSession(userId, target)
}

export async function getSession(sessionId: string, signal?: AbortSignal): Promise<SessionDetail> {
  if (!isMockMode) return realSessions.getSession(sessionId, signal)
  const userId = await mockUser(160, signal)
  return mockGetSession(userId, sessionId)
}

export async function getQuestions(
  sessionId: string,
  signal?: AbortSignal,
): Promise<{ questions: Question[] }> {
  if (!isMockMode) return realSessions.getQuestions(sessionId, signal)
  const userId = await mockUser(220, signal)
  return mockGetQuestions(userId, sessionId)
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<AnswerSaveResult> {
  resourcesCache.invalidateSession(sessionId)
  try {
    if (!isMockMode) return await realSessions.saveAnswer(sessionId, questionId, answer)
    const userId = await mockUser(260)
    return mockSaveAnswer(userId, sessionId, questionId, answer)
  } finally { resourcesCache.invalidateSession(sessionId) }
}

export async function completeSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<CompletionResult> {
  resourcesCache.invalidateSession(sessionId)
  try {
    if (!isMockMode) return await realSessions.completeSession(sessionId, signal)
    const userId = await mockUser(420, signal)
    return mockCompleteSession(userId, sessionId)
  } finally { resourcesCache.invalidateSession(sessionId) }
}

export async function getNodeResources(
  sessionId: string,
  nodeId: string,
): Promise<NodeResources> {
  const user = await ensureCurrentUser()
  const result = await resourcesCache.read(JSON.stringify([user.userId, user.csrfToken]), sessionId, nodeId, async () => {
    if (!isMockMode) return realSessions.getNodeResources(sessionId, nodeId)
    const userId = await mockUser(280)
    return mockGetNodeResources(userId, sessionId, nodeId)
  })
  if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
  return result
}

export async function getSessionHistory(page = 1): Promise<import('./types').SessionHistory> {
  if (!isMockMode) return realSessions.getSessionHistory(page)
  return mockGetSessionHistory(await mockUser(160), page)
}

export async function deleteSession(sessionId: string): Promise<void> {
  resourcesCache.invalidateSession(sessionId)
  try {
    if (!isMockMode) return await realSessions.deleteSession(sessionId)
    mockDeleteSession(await mockUser(160), sessionId)
  } finally { resourcesCache.invalidateSession(sessionId) }
}
