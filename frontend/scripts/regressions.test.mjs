import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
after(() => server.close())
const cache = new Map()
globalThis.localStorage = { removeItem: key => cache.delete(key), get length() { return cache.size }, key: index => [...cache.keys()][index] ?? null, getItem: (key) => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) }
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


test('mock retains all nodes and applies assessment resource counts after submission', () => {
  const user = 'assessment-policy'
  const { sessionId } = store.mockCreateSession(user, 'Transformer')
  const key = `zhijie-mock-session-v3:${user}:${sessionId}`
  const age = (field) => {
    const record = JSON.parse(cache.get(key))
    record[field] = Date.now() - 10_000
    cache.set(key, JSON.stringify(record))
  }
  age('createdAt')
  const questions = store.mockGetQuestions(user, sessionId).questions
  const answers = ['VERY_FAMILIAR', 'BASICALLY_KNOW', 'HEARD_OF', 'DONT_KNOW']
  for (const [i, q] of questions.entries()) store.mockSaveAnswer(user, sessionId, q.questionId, answers[i % 4])
  const pending = store.mockCompleteSession(user, sessionId)
  assert.equal(pending.status, 'SEARCHING_RESOURCES')
  assert.equal(store.mockCompleteSession(user, sessionId).status, 'SEARCHING_RESOURCES')
  assert.throws(() => store.mockSaveAnswer(user, sessionId, questions[0].questionId, 'DONT_KNOW'), e => e.status === 409)
  age('resourcesStartedAt')
  assert.equal(store.mockGetSession(user, sessionId).status, 'COMPLETED')
  const result = store.mockCompleteSession(user, sessionId)
  assert.equal(result.nodes.length, questions.length + 1)
  for (const [i, q] of questions.entries()) {
    const node = result.nodes.find(n => n.id === q.nodeId)
    const expected = [0, 2, 3, 5][i % 4]
    assert.equal(node.resourceLimit, expected)
    const resources = store.mockGetNodeResources(user, sessionId, node.id)
    assert.ok(resources.resources.length <= expected)
    if (!expected) assert.equal(resources.resourceStatus, 'NOT_APPLICABLE')
    if (resources.resourceStatus === 'READY') assert.equal(resources.resources.length, expected)
  }
})


test('graph progress is monotonic, capped while waiting, and settles after its completion animation', async () => {
  const { GraphProgressTimeline } = await server.ssrLoadModule('/src/components/waiting/graphProgress.ts')
  const timeline = new GraphProgressTimeline(0, true)
  assert.equal(timeline.sample(0, false).percent, 0)
  const halfway = timeline.sample(30000, false).percent
  assert.ok(halfway > 0 && halfway < 95)
  assert.equal(timeline.sample(30000, true).percent, halfway)
  const finishing = timeline.sample(30450, true)
  assert.ok(finishing.percent > halfway && finishing.percent < 100)
  assert.equal(finishing.settled, false)
  assert.deepEqual(timeline.sample(30900, true), { percent: 100, settled: false })
  assert.deepEqual(timeline.sample(31150, true), { percent: 100, settled: true })
  const longWait = new GraphProgressTimeline(0, true)
  assert.equal(longWait.sample(900000, false).percent, 95)
  assert.equal(longWait.sample(900000, false).settled, false)
  assert.deepEqual(new GraphProgressTimeline(0, false).sample(0, true), { percent: 100, settled: true })
})


test('graph routes avoid cards across skipped levels, uneven heights and wrapped rows', async () => {
  const { routeEdge } = await server.ssrLoadModule('/src/components/result/routeEdges.ts')
  const fixtures = [
    [{id:'a',left:100,right:300,top:0,bottom:200},{id:'b',left:80,right:320,top:260,bottom:560},{id:'c',left:100,right:300,top:650,bottom:850}],
    [{id:'a',left:0,right:200,top:0,bottom:300},{id:'b',left:230,right:430,top:0,bottom:420},{id:'c',left:230,right:430,top:500,bottom:700}],
    [{id:'a',left:20,right:220,top:0,bottom:200},{id:'b',left:20,right:220,top:230,bottom:450},{id:'c',left:20,right:220,top:540,bottom:800}]
  ]
  for (const cards of fixtures) {
    const path = routeEdge(cards[0], cards[2], cards)
    assert.ok(path.length >= 2)
    for (let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i]
      assert.ok(a.x===b.x || a.y===b.y)
      for (const r of cards) {
        const crosses = a.x===b.x
          ? a.x>r.left && a.x<r.right && Math.max(a.y,b.y)>r.top && Math.min(a.y,b.y)<r.bottom
          : a.y>r.top && a.y<r.bottom && Math.max(a.x,b.x)>r.left && Math.min(a.x,b.x)<r.right
        assert.equal(crosses,false,`crossed ${r.id}`)
      }
    }
  }
})


test('assessment stops writes and completion when navigation cancels its owner', async () => {
  const { submitAssessment } = await server.ssrLoadModule('/src/components/quiz/submitAssessment.ts')
  const questions = [{questionId:'1',answer:'DONT_KNOW'}, {questionId:'2',answer:'HEARD_OF'}]
  let active = true
  let release
  const calls = []
  const pending = submitAssessment(questions, async id => {
    calls.push(id)
    await new Promise(resolve => { release = resolve })
  }, async () => { calls.push('complete'); return 'done' }, () => active)
  active = false
  release()
  assert.equal(await pending, null)
  assert.deepEqual(calls, ['1'])
})

test('assessment validates all answers before writing and does not complete on save failure', async () => {
  const { submitAssessment } = await server.ssrLoadModule('/src/components/quiz/submitAssessment.ts')
  const calls = []
  const save = async id => { calls.push(id); throw new Error('offline') }
  const complete = async () => { calls.push('complete') }
  await assert.rejects(submitAssessment([{questionId:'1',answer:null}], save, complete, () => true))
  assert.deepEqual(calls, [])
  await assert.rejects(submitAssessment([{questionId:'1',answer:'DONT_KNOW'}], save, complete, () => true), /offline/)
  assert.deepEqual(calls, ['1'])
})

test('assessment completes after all saves and ignores completion after leaving', async () => {
  const { submitAssessment } = await server.ssrLoadModule('/src/components/quiz/submitAssessment.ts')
  const calls = []
  let active = true
  const result = await submitAssessment([{questionId:'1',answer:'HEARD_OF'}, {questionId:'2',answer:'DONT_KNOW'}],
    async id => { calls.push(id) }, async () => { calls.push('complete'); active = false; return 'old result' }, () => active)
  assert.equal(result, null)
  assert.deepEqual(calls, ['1', '2', 'complete'])
})

 test('history lists only owned records and paginates twenty at a time', () => {
  for (let i=0;i<21;i++) store.mockCreateSession('history-alice', `目标${i}`)
  store.mockCreateSession('history-bob', '其他用户目标')
  const first=store.mockGetSessionHistory('history-alice',1)
  assert.equal(first.total,21)
  assert.equal(first.items.length,20)
  assert.ok(first.items.every(item=>item.target.startsWith('目标')))
  assert.equal(store.mockGetSessionHistory('history-alice',2).items.length,1)
  assert.equal(store.mockGetSessionHistory('history-empty',1).total,0)
 })

test('mock deletion removes owned persistent history and rejects another user', () => {
  const {sessionId}=store.mockCreateSession('delete-alice','待删除')
  assert.throws(()=>store.mockDeleteSession('delete-bob',sessionId),error=>error.status===404)
  store.mockDeleteSession('delete-alice',sessionId)
  assert.equal(cache.has(`zhijie-mock-session-v3:delete-alice:${sessionId}`),false)
  assert.equal(store.mockGetSessionHistory('delete-alice',1).total,0)
  assert.throws(()=>store.mockGetSession('delete-alice',sessionId),error=>error.status===404)
})


test('real create retries preserve the supplied idempotency key and CSRF header', async () => {
  const originalFetch = globalThis.fetch
  const auth = await server.ssrLoadModule('/src/api/auth.ts')
  const real = await server.ssrLoadModule('/src/api/real/sessions.ts')
  let user
  const attempts = []
  try {
    globalThis.fetch = async (url, init) => {
      if (String(url).endsWith('/auth/me')) return new Response(JSON.stringify({ userId: 'idem-user', csrfToken: 'idem-csrf' }), { status: 200 })
      attempts.push({ key: new Headers(init.headers).get('Idempotency-Key'), csrf: new Headers(init.headers).get('X-CSRF-Token') })
      if (attempts.length === 1) throw new TypeError('connection dropped')
      return new Response(JSON.stringify({ sessionId: '123', status: 'GENERATING_GRAPH' }), { status: 202 })
    }
    user = await auth.ensureCurrentUser()
    await assert.rejects(real.createSession('Transformer', 'retry-request-123'), error => error.code === 'NETWORK_ERROR')
    assert.equal((await real.createSession('Transformer', 'retry-request-123')).sessionId, '123')
    assert.deepEqual(attempts, [{ key: 'retry-request-123', csrf: user.csrfToken }, { key: 'retry-request-123', csrf: user.csrfToken }])
  } finally {
    if (user) auth.invalidateCurrentUser(user)
    globalThis.fetch = originalFetch
  }
})
