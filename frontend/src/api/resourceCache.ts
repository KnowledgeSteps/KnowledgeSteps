import { ApiError } from './types'

/** 仅内存缓存：隔离登录身份、寻路与节点；失效后不接受迟到响应。 */
export class ResourceCache<T> {
  private entries = new Map<string, { sessionId: string; expires: number; promise: Promise<T> }>()

  constructor(private readonly now = Date.now, private readonly ttl = 30_000, private readonly capacity = 64) {}

  read(scope: string, sessionId: string, nodeId: string, load: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([scope, sessionId, nodeId])
    const previous = this.entries.get(key)
    if (previous && previous.expires > this.now()) return previous.promise
    this.entries.delete(key)
    while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!)
    const entry = { sessionId, expires: Infinity, promise: null as unknown as Promise<T> }
    entry.promise = Promise.resolve().then(load).then(value => {
      if (this.entries.get(key) !== entry) {
        throw new ApiError(409, 'RESOURCE_CACHE_INVALIDATED', '资料状态已变化，请重新打开。')
      }
      entry.expires = this.now() + this.ttl
      return value
    }).catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    this.entries.set(key, entry)
    return entry.promise
  }

  invalidateSession(sessionId: string): void {
    for (const [key, entry] of this.entries) if (entry.sessionId === sessionId) this.entries.delete(key)
  }

  clear(): void { this.entries.clear() }
}
