import { apiJson, apiVoid } from './http'
import { ApiError, type CurrentUser } from './types'
import { objectValue, stringValue } from './validators'

export interface AuthSnapshot {
  status: 'unknown' | 'loading' | 'authenticated' | 'anonymous' | 'error'
  user: CurrentUser | null
  error: string | null
}

let snapshot: AuthSnapshot = { status: 'unknown', user: null, error: null }
let currentUserRequest: Promise<CurrentUser> | null = null
let generation = 0
let mutationPending = false
const listeners = new Set<() => void>()

function publish(next: AuthSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAuthSnapshot(): AuthSnapshot {
  return snapshot
}

function parseCurrentUser(value: unknown): CurrentUser {
  const record = objectValue(value)
  return {
    userId: stringValue(record.userId),
    nickname: typeof record.nickname === 'string' ? record.nickname : undefined,
    avatarUrl: typeof record.avatarUrl === 'string' && /^https?:\/\//i.test(record.avatarUrl) ? record.avatarUrl : undefined,
    csrfToken: stringValue(record.csrfToken),
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  if (mutationPending) throw changedAuthentication()
  const requestGeneration = generation
  // A CSRF refresh of the same login should not remount task pages or replay their effects.
  if (!snapshot.user) publish({ status: 'loading', user: null, error: null })
  try {
    const user = await apiJson('/api/v1/auth/me', { method: 'GET', cache: 'no-store' }, parseCurrentUser)
    if (requestGeneration !== generation) throw changedAuthentication()
    publish({ status: 'authenticated', user, error: null })
    return user
  } catch (error) {
    if (requestGeneration === generation) {
      publish({
        status: error instanceof ApiError && error.status === 401 ? 'anonymous' : 'error',
        user: null,
        error: error instanceof ApiError ? error.message : '暂时无法确认登录状态。',
      })
    }
    throw error
  }
}

export async function ensureCurrentUser(): Promise<CurrentUser> {
  if (mutationPending) throw changedAuthentication()
  if (currentUserRequest) return currentUserRequest
  if (snapshot.user) return snapshot.user
  return startCurrentUserRequest()
}

function startCurrentUserRequest(): Promise<CurrentUser> {
  const request = getCurrentUser().finally(() => {
    if (currentUserRequest === request) currentUserRequest = null
  })
  currentUserRequest = request
  return request
}

export async function refreshCurrentUser(): Promise<CurrentUser> {
  if (mutationPending) throw changedAuthentication()
  generation += 1
  currentUserRequest = null
  return startCurrentUserRequest()
}

function changedAuthentication(): ApiError {
  return new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
}

export function isCurrentAuthentication(user: CurrentUser): boolean {
  return snapshot.user?.csrfToken === user.csrfToken && snapshot.user.userId === user.userId
}

// A late 401 from an earlier session must not clear a more recent login.
export function invalidateCurrentUser(user: CurrentUser): void {
  if (!isCurrentAuthentication(user)) return
  generation += 1
  currentUserRequest = null
  publish({ status: 'anonymous', user: null, error: '登录已失效，请重新登录。' })
}

export function getCsrfToken(): string | null {
  return snapshot.user?.csrfToken ?? null
}

export async function loginAdmin(username: string, password: string): Promise<CurrentUser> {
  if (mutationPending) throw changedAuthentication()
  const requestGeneration = ++generation
  currentUserRequest = null
  mutationPending = true
  publish({ status: 'loading', user: null, error: null })
  try {
    const csrfToken = await apiJson('/api/v1/auth/csrf', { method: 'GET', cache: 'no-store' }, (value) =>
      stringValue(objectValue(value).csrfToken),
    )
    const user = await apiJson('/api/v1/auth/admin/login', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken },
      body: { username, password },
      cache: 'no-store',
    }, parseCurrentUser)
    if (requestGeneration !== generation) throw changedAuthentication()
    publish({ status: 'authenticated', user, error: null })
    return user
  } catch (error) {
    if (requestGeneration === generation) publish({ status: 'anonymous', user: null, error: null })
    throw error
  } finally {
    if (requestGeneration === generation) mutationPending = false
  }
}

export async function logout(): Promise<void> {
  if (mutationPending) throw changedAuthentication()
  const user = await ensureCurrentUser()
  const requestGeneration = ++generation
  mutationPending = true
  currentUserRequest = null
  publish({ status: 'loading', user: null, error: null })
  try {
    await apiVoid('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': user.csrfToken },
    })
    if (requestGeneration === generation) publish({ status: 'anonymous', user: null, error: null })
  } catch (error) {
    if (requestGeneration === generation) {
      if (error instanceof ApiError && error.status === 401) {
        publish({ status: 'anonymous', user: null, error: null })
        return
      }
      // Do not report a successful logout if the server did not confirm it.
      publish({ status: 'error', user: null, error: '退出未完成，请重新确认登录状态后重试。' })
    }
    throw error
  } finally {
    if (requestGeneration === generation) mutationPending = false
  }
}

export async function refreshAfterCsrfFailure(error: unknown): Promise<void> {
  if (error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID') {
    await refreshCurrentUser()
  }
}
