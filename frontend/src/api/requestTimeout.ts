import { ApiError } from './types'

export const REQUEST_TIMEOUT_MS = 15_000

/** Covers the response body too; releases timers/listeners on every outcome. */
export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal?: AbortSignal | null,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => {
      controller.abort()
      reject(new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。'))
    }
    if (callerSignal?.aborted) { cancel(); return }
    callerSignal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => {
      reject(new ApiError(0, 'REQUEST_TIMEOUT', '请求超时，请检查网络后重试；如果刚提交了操作，请先刷新确认结果。'))
      controller.abort()
    }, timeoutMs)
  })
  try {
    return await Promise.race([interrupted, Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。')
      return operation(controller.signal)
    })])
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', cancel)
  }
}
