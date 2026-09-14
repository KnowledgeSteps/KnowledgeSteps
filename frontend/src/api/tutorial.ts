import { ensureCurrentUser, isCurrentAuthentication } from './auth'
import { apiJson } from './http'
import { booleanValue, numberValue, objectValue } from './validators'
import { ApiError } from './types'

export interface TutorialProgress { step: number; prompted: boolean; revision: number }
function parse(value: unknown): TutorialProgress {
  const v = objectValue(value)
  const step = numberValue(v.step), revision = numberValue(v.revision)
  if (!Number.isInteger(step) || step < 0 || step > 5 || !Number.isInteger(revision) || revision < 0) throw new Error('教程进度无效')
  return { step, revision, prompted: booleanValue(v.prompted) }
}
export async function getTutorial(signal?: AbortSignal) {
  const user = await ensureCurrentUser()
  const data = await apiJson('/api/v1/tutorial', { signal, cache: 'no-store' }, parse)
  if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化')
  return data
}
export async function changeTutorial(action: 'seen' | 'advance' | 'reset', revision: number) {
  const user = await ensureCurrentUser()
  const data = await apiJson('/api/v1/tutorial', { method: 'PATCH', body: { action, revision }, headers: { 'X-CSRF-Token': user.csrfToken } }, parse)
  if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化')
  return data
}
