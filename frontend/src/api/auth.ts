import { apiJson, apiVoid } from './http'
import { ApiError, type CurrentUser } from './types'
import { objectValue, stringValue } from './validators'

let currentUser: CurrentUser | null = null
let currentUserRequest: Promise<CurrentUser> | null = null

function parseCurrentUser(value: unknown): CurrentUser {
  const record = objectValue(value)
  return {
    userId: stringValue(record.userId),
    csrfToken: stringValue(record.csrfToken),
  }
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await apiJson('/api/v1/auth/me', { method: 'GET' }, parseCurrentUser)
  currentUser = user
  return user
}

export async function ensureCurrentUser(): Promise<CurrentUser> {
  if (currentUser) return currentUser
  currentUserRequest ??= getCurrentUser().finally(() => {
    currentUserRequest = null
  })
  return currentUserRequest
}

export async function refreshCurrentUser(): Promise<CurrentUser> {
  currentUser = null
  currentUserRequest = null
  return ensureCurrentUser()
}

export function getCsrfToken(): string | null {
  return currentUser?.csrfToken ?? null
}

export async function logout(): Promise<void> {
  const user = await ensureCurrentUser()
  try {
    await apiVoid('/api/v1/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': user.csrfToken },
    })
  } finally {
    currentUser = null
    currentUserRequest = null
  }
}

export async function refreshAfterCsrfFailure(error: unknown): Promise<void> {
  if (error instanceof ApiError && error.status === 403 && error.code === 'CSRF_INVALID') {
    await refreshCurrentUser()
  }
}
