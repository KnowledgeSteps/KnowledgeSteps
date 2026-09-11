import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const cache = new Map()
globalThis.localStorage = { getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) }
const store = await server.ssrLoadModule('/src/api/mock/store.ts')
const { withRequestTimeout } = await server.ssrLoadModule('/src/api/requestTimeout.ts')

test('mock users cannot read, answer, complete, or retrieve another user task', () => {
  const { sessionId } = store.mockCreateSession('alice', 'Transformer')
  assert.equal(store.mockGetSession('alice', sessionId).target, 'Transformer')
  for (const operation of [
    () => store.mockGetSession('bob', sessionId),
    () => store.mockGetQuestions('bob', sessionId),
    () => store.mockSaveAnswer('bob', sessionId, '1', 'DONT_KNOW'),
    () => store.mockCompleteSession('bob', sessionId),
    () => store.mockGetNodeResources('bob', sessionId, '1'),
  ]) assert.throws(operation, (error) => error.status === 404)
  const other = store.mockCreateSession('bob', 'RAG')
  assert.ok(cache.has(`zhijie-mock-session-v3:alice:${sessionId}`))
  assert.ok(cache.has(`zhijie-mock-session-v3:bob:${other.sessionId}`))
  assert.equal(store.mockGetSession('bob', other.sessionId).target, 'RAG')
})

test('cache restore excludes records belonging to a different user', () => {
  cache.set('zhijie-mock-sessions-v2:charlie', JSON.stringify([{ id: '999', userId: 'alice' }]))
  assert.throws(() => store.mockGetSession('charlie', '999'), (error) => error.status === 404)
})

test('hung request times out and aborts underlying work', async () => {
  let signal
  await assert.rejects(withRequestTimeout((value) => { signal = value; return new Promise(() => {}) }, null, 15), (error) => error.code === 'REQUEST_TIMEOUT')
  assert.equal(signal.aborted, true)
})

test('timeout covers a response body that never completes', async () => {
  await assert.rejects(withRequestTimeout(async () => {
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }))
    return response.text()
  }, null, 15), (error) => error.code === 'REQUEST_TIMEOUT')
})

test('external cancellation propagates and already-aborted requests do not run', async () => {
  const controller = new AbortController()
  controller.abort()
  let ran = false
  await assert.rejects(withRequestTimeout(async () => { ran = true }, controller.signal), (error) => error.code === 'REQUEST_CANCELLED')
  assert.equal(ran, false)
  const next = new AbortController()
  const pending = withRequestTimeout(() => new Promise(() => {}), next.signal)
  next.abort()
  await assert.rejects(pending, (error) => error.code === 'REQUEST_CANCELLED')
})

test('successful requests clean up their timeout', async () => {
  let signal
  assert.equal(await withRequestTimeout(async (value) => { signal = value; return 42 }, null, 15), 42)
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(signal.aborted, false)
})


test('a mock write pending during logout is rejected before mutation', async () => {
  const originalFetch = globalThis.fetch
  const auth = await server.ssrLoadModule('/src/api/auth.ts')
  const sessions = await server.ssrLoadModule('/src/api/sessions.ts')
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ userId: 'race-user', csrfToken: 'test-token' }), { status: 200 })
    const user = await auth.ensureCurrentUser()
    const pending = sessions.createSession('Transformer')
    auth.invalidateCurrentUser(user)
    await assert.rejects(pending, (error) => error.code === 'AUTH_CHANGED')
    assert.equal([...cache.keys()].some(key => key.startsWith('zhijie-mock-session-v3:race-user:')), false)
  } finally { globalThis.fetch = originalFetch }
})


test('two tabs create distinct tasks and read each other updates without replacing other tasks', async () => {
  const a = await server.ssrLoadModule('/src/api/mock/store.ts?tab=a')
  const b = await server.ssrLoadModule('/src/api/mock/store.ts?tab=b')
  const first = a.mockCreateSession('tabs', 'Transformer')
  const second = b.mockCreateSession('tabs', 'RAG')
  assert.notEqual(first.sessionId, second.sessionId)
  assert.equal(b.mockGetSession('tabs', first.sessionId).target, 'Transformer')
  assert.equal(a.mockGetSession('tabs', second.sessionId).target, 'RAG')
  const key = `zhijie-mock-session-v3:tabs:${first.sessionId}`
  const record = JSON.parse(cache.get(key))
  record.createdAt = Date.now() - 10_000
  cache.set(key, JSON.stringify(record))
  const questions = a.mockGetQuestions('tabs', first.sessionId).questions
  a.mockSaveAnswer('tabs', first.sessionId, questions[0].questionId, 'DONT_KNOW')
  assert.equal(b.mockGetQuestions('tabs', first.sessionId).questions[0].answer, 'DONT_KNOW')
  b.mockSaveAnswer('tabs', first.sessionId, questions[1].questionId, 'VERY_FAMILIAR')
  const updated = a.mockGetQuestions('tabs', first.sessionId).questions
  assert.equal(updated[0].answer, 'DONT_KNOW')
  assert.equal(updated[1].answer, 'VERY_FAMILIAR')
  assert.equal(b.mockGetSession('tabs', second.sessionId).target, 'RAG')
})
