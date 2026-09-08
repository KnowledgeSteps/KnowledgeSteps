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
  const [error, setError] = useState<ApiError | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function poll(): Promise<void> {
      try {
        const detail = await getSession(sessionId)
        if (cancelled) return
        setSession(detail)
        setError(null)
        setLoaded(true)
        if (isGenerating(detail.status)) {
          timer = window.setTimeout(poll, 1100)
        }
      } catch (caught) {
        if (cancelled) return
        const apiError =
          caught instanceof ApiError
            ? caught
            : new ApiError(0, 'NETWORK_ERROR', '暂时无法连接服务，请稍后重试。')
        setError(apiError)
        setLoaded(true)
        // 404 说明任务不存在或无权访问，不再空转轮询
        if (apiError.status !== 404) {
          timer = window.setTimeout(poll, 1800)
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

  return { session, error, loaded, reload }
}
