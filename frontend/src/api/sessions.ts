import { ensureCurrentUser, isCurrentAuthentication } from './auth'
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
  mockCompleteSession,
  mockCreateSession,
  mockGetNodeResources,
  mockGetQuestions,
  mockGetSession,
  mockSaveAnswer,
} from './mock/store'
import * as realSessions from './real/sessions'

async function mockUser(ms: number): Promise<string> {
  const user = await ensureCurrentUser()
  await new Promise((resolve) => setTimeout(resolve, ms))
  if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
  return user.userId
}

export async function createSession(target: string): Promise<{
  sessionId: string
  status: SessionStatus
}> {
  if (!isMockMode) return realSessions.createSession(target)
  const userId = await mockUser(320)
  return mockCreateSession(userId, target)
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  if (!isMockMode) return realSessions.getSession(sessionId)
  const userId = await mockUser(160)
  return mockGetSession(userId, sessionId)
}

export async function getQuestions(
  sessionId: string,
): Promise<{ questions: Question[] }> {
  if (!isMockMode) return realSessions.getQuestions(sessionId)
  const userId = await mockUser(220)
  return mockGetQuestions(userId, sessionId)
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<AnswerSaveResult> {
  if (!isMockMode) return realSessions.saveAnswer(sessionId, questionId, answer)
  const userId = await mockUser(260)
  return mockSaveAnswer(userId, sessionId, questionId, answer)
}

export async function completeSession(
  sessionId: string,
): Promise<CompletionResult> {
  if (!isMockMode) return realSessions.completeSession(sessionId)
  const userId = await mockUser(420)
  return mockCompleteSession(userId, sessionId)
}

export async function getNodeResources(
  sessionId: string,
  nodeId: string,
): Promise<NodeResources> {
  if (!isMockMode) return realSessions.getNodeResources(sessionId, nodeId)
  const userId = await mockUser(280)
  return mockGetNodeResources(userId, sessionId, nodeId)
}
