import { ApiError } from './types'

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 16_000]

export function readError(caught: unknown): ApiError {
  return caught instanceof ApiError
    ? caught
    : new ApiError(0, 'NETWORK_ERROR', '暂时无法连接服务，请稍后重试。')
}

export function isRetryableReadError(error: ApiError): boolean {
  if (error.code === 'REQUEST_CANCELLED' || error.code === 'AUTH_CHANGED') return false
  return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500 || error.code === 'CSRF_INVALID'
}

export function readRetryDelay(error: ApiError, failures: number): number | null {
  if (!isRetryableReadError(error) || failures > RETRY_DELAYS_MS.length) return null
  const retryAfter = (error.retryAfterSeconds ?? 0) * 1000
  // Long upstream cooldowns are shown to the user instead of silently waiting indefinitely.
  if (retryAfter > 60_000) return null
  return Math.max(RETRY_DELAYS_MS[failures - 1], retryAfter)
}

export interface ReadRecovery {
  error: ApiError | null
  retrying: boolean
  retryDelayMs: number | null
}

interface ReadOptions<T> {
  read: (signal: AbortSignal) => Promise<T>
  onData: (data: T) => void
  onRecovery: (recovery: ReadRecovery) => void
  shouldPoll?: (data: T) => boolean
  schedule?: (callback: () => void, delayMs: number) => () => void
  random?: () => number
  now?: () => number
  visibility?: { isHidden: () => boolean; subscribe: (changed: () => void) => () => void }
}

/** Retry reads of the existing task; never create a replacement or fabricate FAILED state. */
export function startRecoverableRead<T>({ read, onData, onRecovery, shouldPoll,
  random = Math.random, now = () => performance.now(),
  visibility = {
    isHidden: () => typeof document !== 'undefined' && document.hidden,
    subscribe: changed => {
      if (typeof document === 'undefined') return () => {}
      document.addEventListener('visibilitychange', changed)
      return () => document.removeEventListener('visibilitychange', changed)
    },
  },
  schedule = (callback, delay) => {
    const timer = setTimeout(callback, delay)
    return () => clearTimeout(timer)
  },
}: ReadOptions<T>): () => void {
  let cancelled = false
  let failures = 0
  let clearTimer: (() => void) | undefined
  const controller = new AbortController()
  let running = false
  let continuing = true
  let notBefore = 0

  function scheduleNext(delay: number): number {
    clearTimer?.()
    const base = visibility.isHidden() ? Math.max(30_000, delay) : delay
    const jitter = Math.floor(random() * Math.min(1000, Math.max(250, base / 4)))
    const actual = base + jitter
    clearTimer = schedule(() => void attempt(), actual)
    return actual
  }

  async function attempt(): Promise<void> {
    if (cancelled || running) return
    clearTimer = undefined
    running = true
    try {
      const data = await read(controller.signal)
      if (cancelled) return
      failures = 0
      onData(data)
      onRecovery({ error: null, retrying: false, retryDelayMs: null })
      continuing = shouldPoll?.(data) ?? false
      notBefore = 0
      if (continuing) scheduleNext(2_000)
    } catch (caught) {
      if (cancelled) return
      const error = readError(caught)
      const delay = readRetryDelay(error, ++failures)
      continuing = delay !== null
      notBefore = delay === null ? Infinity : now() + delay
      const actual = delay === null ? null : scheduleNext(delay)
      onRecovery({ error, retrying: actual !== null, retryDelayMs: actual })
    } finally {
      running = false
    }
  }

  const unsubscribe = visibility.subscribe(() => {
    // 已耗尽重试或终止的读取不会因切换标签页自动重新开始。
    if (!cancelled && continuing && !running) scheduleNext(Math.max(0, notBefore - now()))
  })
  void attempt()
  return () => { cancelled = true; clearTimer?.(); unsubscribe(); controller.abort() }
}
