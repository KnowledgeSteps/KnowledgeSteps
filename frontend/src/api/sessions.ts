import type {
  AnswerSaveResult,
  AnswerValue,
  CompletionResult,
  NodeResources,
  Question,
  SessionDetail,
  SessionStatus,
} from './types'
import {
  mockCompleteSession,
  mockCreateSession,
  mockGetNodeResources,
  mockGetQuestions,
  mockGetSession,
  mockSaveAnswer,
} from './mock/store'

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 当前全部走本地 Mock；真实后端就绪后，只需把这些函数替换为 HTTP 请求，
 * 页面与组件无需改动。
 */
export async function createSession(target: string): Promise<{
  sessionId: string
  status: SessionStatus
}> {
  await wait(320)
  return mockCreateSession(target)
}

export async function getSession(sessionId: string): Promise<SessionDetail> {
  await wait(160)
  return mockGetSession(sessionId)
}

export async function getQuestions(
  sessionId: string,
): Promise<{ questions: Question[] }> {
  await wait(220)
  return mockGetQuestions(sessionId)
}

export async function saveAnswer(
  sessionId: string,
  questionId: string,
  answer: AnswerValue,
): Promise<AnswerSaveResult> {
  await wait(260)
  return mockSaveAnswer(sessionId, questionId, answer)
}

export async function completeSession(
  sessionId: string,
): Promise<CompletionResult> {
  await wait(420)
  return mockCompleteSession(sessionId)
}

export async function getNodeResources(
  sessionId: string,
  nodeId: string,
): Promise<NodeResources> {
  await wait(280)
  return mockGetNodeResources(sessionId, nodeId)
}
