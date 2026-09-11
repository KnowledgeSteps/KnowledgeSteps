import { useCallback, useEffect, useState } from 'react'
import { ApiError, type SessionDetail, type SessionStatus } from '../api/types'
import { getSession } from '../api/sessions'

const GENERATING_STATUSES: SessionStatus[] = [
  'GENERATING_GRAPH',
  'SEARCHING_RESOURCES',
  'GENERATING_QUESTIONS',
]

export function isGenerating(status: SessionStatus): boolean {
  return GENERATING_STATUSES.includes(status)
}

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [errorState, setErrorState] = useState<{
    sessionId: string
    error: ApiError
  } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    if (!sessionId) return

    async function poll(): Promise<void> {
      try {
        const detail = await getSession(sessionId)
        if (cancelled) return
        setSession(detail)
        setErrorState(null)
        if (isGenerating(detail.status)) {
          timer = window.setTimeout(poll, 2000)
        }
      } catch (caught) {
        if (cancelled) return
        const apiError =
          caught instanceof ApiError
            ? caught
            : new ApiError(0, 'NETWORK_ERROR', '暂时无法连接服务，请稍后重试。')
        setErrorState({ sessionId, error: apiError })
        // 404/401/403 说明任务不可继续访问，不再空转轮询
        if (![404, 401, 403].includes(apiError.status)) {
          timer = window.setTimeout(poll, 2000)
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [sessionId, tick])

  const reload = useCallback(() => {
    setTick((value) => value + 1)
  }, [])

  const visibleSession = session?.sessionId === sessionId ? session : null
  const error =
    errorState?.sessionId === sessionId
      ? errorState.error
      : sessionId
        ? null
        : new ApiError(404, 'NOT_FOUND', '任务不存在或无权访问。')

  const loaded = Boolean(visibleSession || error)

  return { session: visibleSession, error, loaded, reload }
}
