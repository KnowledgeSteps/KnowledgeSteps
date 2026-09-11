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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function createSession(target: string): Promise<{
  sessionId: string
  status: SessionStatus
}> {
  if (!isMockMode) return realSessions.createSession(target)
  await wait(320)
  return mockCreateSession(target)
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  if (!isMockMode) return realSessions.getSession(sessionId)
  await wait(160)
  return mockGetSession(sessionId)
}

export async function getQuestions(
  sessionId: string,
): Promise<{ questions: Question[] }> {
  if (!isMockMode) return realSessions.getQuestions(sessionId)
  await wait(220)
  return mockGetQuestions(sessionId)
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<AnswerSaveResult> {
  if (!isMockMode) return realSessions.saveAnswer(sessionId, questionId, answer)
  await wait(260)
  return mockSaveAnswer(sessionId, questionId, answer)
}

export async function completeSession(
  sessionId: string,
): Promise<CompletionResult> {
  if (!isMockMode) return realSessions.completeSession(sessionId)
  await wait(420)
  return mockCompleteSession(sessionId)
}

export async function getNodeResources(
  sessionId: string,
  nodeId: string,
): Promise<NodeResources> {
  if (!isMockMode) return realSessions.getNodeResources(sessionId, nodeId)
  await wait(280)
  return mockGetNodeResources(sessionId, nodeId)
}
