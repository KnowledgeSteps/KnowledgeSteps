import { ensureCurrentUser, invalidateCurrentUser, isCurrentAuthentication, refreshAfterCsrfFailure } from './auth'
import { apiJson, apiVoid } from './http'
import { ApiError, type CurrentUser } from './types'
import { booleanValue, nullableString, numberValue, objectValue, stringValue } from './validators'

export interface NodeOverview { contentMarkdown: string; generatedAt: string; saved: boolean; familiarity?: string }
export interface KnowledgeCardItem { understood?: boolean; familiarity?: string; sessionTarget?: string; nodeId: string; sessionId: string; nodeName: string; description: string; contentMarkdown: string; generatedAt: string; savedAt: string }
export interface KnowledgeCardPage { items: KnowledgeCardItem[]; total: number; page: number; pageSize: number }
function parseOverview(value: unknown): NodeOverview {
  const v = objectValue(value)
  return { contentMarkdown: stringValue(v.contentMarkdown), generatedAt: stringValue(v.generatedAt), saved: v.saved === undefined ? false : booleanValue(v.saved), familiarity: v.familiarity == null ? undefined : stringValue(v.familiarity) }
}
export interface Explanation {
  id: string; sessionId: string; nodeId: string; nodeName: string; sessionTarget?: string; quote: string
  explanationMarkdown: string; sourceTitle: string; sourceUrl: string | null
  createdAt: string; understood: boolean; saved: boolean
}
export interface DoubtPage { items: Explanation[]; total: number; page: number; pageSize: number }
export interface QuoteRequest { resourceId?: string; quote: string; context?: string }

function parseExplanation(value: unknown): Explanation {
  const v = objectValue(value)
  return { id: stringValue(v.id), sessionId: stringValue(v.sessionId), nodeId: stringValue(v.nodeId),
    nodeName: stringValue(v.nodeName), sessionTarget: v.sessionTarget == null ? undefined : stringValue(v.sessionTarget), quote: stringValue(v.quote), explanationMarkdown: stringValue(v.explanationMarkdown),
    sourceTitle: stringValue(v.sourceTitle), sourceUrl: nullableString(v.sourceUrl), createdAt: stringValue(v.createdAt),
    understood: booleanValue(v.understood), saved: booleanValue(v.saved) }
}
async function guard<T>(user: CurrentUser, request: () => Promise<T>): Promise<T> {
  try {
    const data = await request()
    if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新操作。')
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) invalidateCurrentUser(user)
    if (isCurrentAuthentication(user)) await refreshAfterCsrfFailure(error)
    throw error
  }
}
const nodePath = (session: string, node: string) => `/api/v1/learning-sessions/${encodeURIComponent(session)}/nodes/${encodeURIComponent(node)}`
const overviews = new Map<string, Promise<NodeOverview>>()

export async function getNodeOverview(sessionId: string, nodeId: string, signal?: AbortSignal): Promise<NodeOverview> {
  const user = await ensureCurrentUser()
  if (signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。')
  const key = `${user.userId}:${user.csrfToken}:${sessionId}:${nodeId}`
  let request = overviews.get(key)
  if (!request) {
    // Share the lazy generation across StrictMode/remounts; backend caches its result.
    request = guard(user, () => apiJson(`${nodePath(sessionId, nodeId)}/overview`, {
      method: 'POST', body: {}, headers: { 'X-CSRF-Token': user.csrfToken }, timeoutMs: 95_000,
    }, parseOverview))
      .finally(() => overviews.delete(key))
    overviews.set(key, request)
  }
  const data = await request
  if (signal?.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。')
  return data
}
export async function explainQuote(sessionId: string, nodeId: string, body: QuoteRequest, signal?: AbortSignal) {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson(`${nodePath(sessionId, nodeId)}/explanations`, {
    method: 'POST', body, signal, timeoutMs: 95_000, headers: { 'X-CSRF-Token': user.csrfToken },
  }, parseExplanation))
}
export async function saveDoubt(explanationId: string): Promise<Explanation> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson('/api/v1/doubts', { method: 'POST', body: { explanationId },
    headers: { 'X-CSRF-Token': user.csrfToken } }, parseExplanation))
}
export async function getDoubts(page: number, signal: AbortSignal): Promise<DoubtPage> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson(`/api/v1/doubts?page=${page}`, { method: 'GET', cache: 'no-store', signal }, value => {
    const v = objectValue(value)
    if (!Array.isArray(v.items)) throw new Error('Invalid items')
    return { items: v.items.map(parseExplanation), total: numberValue(v.total), page: numberValue(v.page), pageSize: numberValue(v.pageSize) }
  }))
}
export async function updateDoubt(id: string, understood: boolean): Promise<Explanation> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson(`/api/v1/doubts/${encodeURIComponent(id)}`, { method: 'PATCH', body: { understood },
    headers: { 'X-CSRF-Token': user.csrfToken } }, parseExplanation))
}
export async function deleteDoubt(id: string): Promise<void> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiVoid(`/api/v1/doubts/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': user.csrfToken } }))
}
export async function saveKnowledgeCard(sessionId: string, nodeId: string): Promise<NodeOverview> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson('/api/v1/knowledge-cards', { method: 'POST', body: { sessionId, nodeId }, headers: { 'X-CSRF-Token': user.csrfToken } }, parseOverview))
}
export async function getKnowledgeCards(page: number, signal: AbortSignal): Promise<KnowledgeCardPage> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiJson(`/api/v1/knowledge-cards?page=${page}`, { method: 'GET', signal, cache: 'no-store' }, value => {
    const v = objectValue(value)
    if (!Array.isArray(v.items)) throw new Error('Invalid items')
    return { total: numberValue(v.total), page: numberValue(v.page), pageSize: numberValue(v.pageSize), items: v.items.map(item => {
      const r = objectValue(item)
      return { understood: r.understood == null ? false : booleanValue(r.understood), familiarity: r.familiarity == null ? undefined : stringValue(r.familiarity), sessionTarget: r.sessionTarget == null ? undefined : stringValue(r.sessionTarget), nodeId: stringValue(r.nodeId), sessionId: stringValue(r.sessionId), nodeName: stringValue(r.nodeName), description: stringValue(r.description), contentMarkdown: stringValue(r.contentMarkdown), generatedAt: stringValue(r.generatedAt), savedAt: stringValue(r.savedAt) }
    }) }
  }))
}
export async function removeKnowledgeCard(nodeId: string): Promise<void> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiVoid(`/api/v1/knowledge-cards/${encodeURIComponent(nodeId)}`, { method: 'DELETE', headers: { 'X-CSRF-Token': user.csrfToken } }))
}
export async function markKnowledgeCard(nodeId: string, understood: boolean): Promise<void> {
  const user = await ensureCurrentUser()
  return guard(user, () => apiVoid(`/api/v1/knowledge-cards/${encodeURIComponent(nodeId)}`, { method: 'PATCH', body: { understood }, headers: { 'X-CSRF-Token': user.csrfToken } }))
}
// Collections are limited to 200 saved entries per account. Read every page before
// filtering so records outside the current visible page remain discoverable.
async function readCollection<T>(read: (page: number, signal: AbortSignal) => Promise<{ items: T[]; total: number; pageSize: number }>, signal: AbortSignal) {
  const first = await read(1, signal)
  const items = [...first.items]
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    if (signal.aborted) throw new ApiError(0, 'REQUEST_CANCELLED', '请求已取消。')
    items.push(...(await read(page, signal)).items)
  }
  return { items, total: items.length, pageSize: 20 }
}
export const getAllDoubts = (signal: AbortSignal) => readCollection(getDoubts, signal)
export const getAllKnowledgeCards = (signal: AbortSignal) => readCollection(getKnowledgeCards, signal)
