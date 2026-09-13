import { useCallback } from 'react'
import { ApiError, type SessionDetail, type SessionStatus } from '../api/types'
import { getSession } from '../api/sessions'
import { useRecoverableRead } from './useRecoverableRead'

const GENERATING_STATUSES: SessionStatus[] = ['GENERATING_GRAPH', 'SEARCHING_RESOURCES', 'GENERATING_QUESTIONS']

export function isGenerating(status: SessionStatus): boolean {
  return GENERATING_STATUSES.includes(status)
}
const shouldPoll = (detail: SessionDetail) => isGenerating(detail.status)

export function useSession(sessionId: string) {
  const read = useCallback((signal: AbortSignal) => getSession(sessionId, signal), [sessionId])
  const { data: session, ...recovery } = useRecoverableRead(sessionId, read, shouldPoll)
  const error = sessionId ? recovery.error : new ApiError(404, 'NOT_FOUND', '任务不存在或无权访问。')
  return { session, ...recovery, error, loaded: Boolean(session || error) }
}
