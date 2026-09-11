export const LOADING_CYCLE_MS = 2000
export const LOADING_FADE_MS = 300

type Timer = ReturnType<typeof setTimeout>
interface Clock {
  now: () => number
  schedule: (callback: () => void, milliseconds: number) => Timer
  cancel: (timer: Timer) => void
}
interface LoadingSnapshot { visible: boolean; fading: boolean; label: string }

/** One continuous overlay across authentication, route changes and Suspense. */
export function createLoadingController(clock: Clock = {
  now: () => performance.now(),
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (timer) => clearTimeout(timer),
}) {
  let snapshot: LoadingSnapshot = { visible: false, fading: false, label: '页面加载中…' }
  let startedAt = 0
  let timer: Timer | undefined
  const requests = new Map<symbol, string>()
  const listeners = new Set<() => void>()
  const publish = (next: LoadingSnapshot) => {
    snapshot = next
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    begin(label: string) {
      if (timer !== undefined) { clock.cancel(timer); timer = undefined }
      if (!snapshot.visible) startedAt = clock.now()
      const request = Symbol('loading')
      requests.set(request, label)
      publish({ visible: true, fading: false, label })
      return () => {
        if (!requests.delete(request)) return
        if (requests.size > 0) {
          publish({ visible: true, fading: false, label: [...requests.values()].at(-1)! })
          return
        }
        // Always defer removal, allowing the next route's loading request to take over.
        timer = clock.schedule(() => {
          timer = undefined
          if (requests.size !== 0) return
          publish({ ...snapshot, fading: true })
          timer = clock.schedule(() => {
            timer = undefined
            if (requests.size === 0) publish({ ...snapshot, visible: false, fading: false })
          }, LOADING_FADE_MS)
        }, Math.max(0, LOADING_CYCLE_MS - (clock.now() - startedAt)))
      }
    },
  }
}

export const loadingController = createLoadingController()
