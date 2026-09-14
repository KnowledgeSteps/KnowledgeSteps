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

test('OAuth navigation retains only allowed local destinations and encodes the return path', async () => {
  const { safeReturnTo, loginUrl } = await server.ssrLoadModule('/src/api/loginNavigation.ts')
  const { zhihuLoginUrl } = await server.ssrLoadModule('/src/api/oauthNavigation.ts')
  for (const path of ['/', '/history', '/sessions/1/questions', '/sessions/1234567890123456789/result']) {
    assert.equal(safeReturnTo(path), path)
    assert.equal(new URL(zhihuLoginUrl(path), 'https://app.example').pathname, '/api/v1/auth/zhihu/start')
    assert.equal(new URL(zhihuLoginUrl(path), 'https://app.example').searchParams.get('returnTo'), path)
    assert.equal(new URL(loginUrl(path), 'https://app.example').searchParams.get('returnTo'), path)
  }
  for (const path of [null, '', 'https://evil.example', '//evil.example', '/\\evil.example', '/login', '/api/v1/auth/logout', '/history?returnTo=//evil.example', '/sessions/0/result', '/sessions/12345678901234567890/result', '/sessions/1/result#section', '/sessions/1/result\n', '/sessions/1/result/..', '%2F%2Fevil.example']) {
    assert.equal(safeReturnTo(path), '/', `unsafe destination: ${path}`)
    assert.equal(zhihuLoginUrl(path), '/api/v1/auth/zhihu/start?returnTo=%2F')
  }
})

test('OAuth callback errors use fixed local messages and never reflect upstream values', async () => {
  const { oauthErrorMessage } = await server.ssrLoadModule('/src/api/oauthNavigation.ts')
  assert.equal(oauthErrorMessage(null), null)
  assert.equal(oauthErrorMessage('OAUTH_UNAVAILABLE'), '知乎登录暂时不可用，请稍后重试。')
  assert.equal(oauthErrorMessage('OAUTH_STATE_INVALID'), '本次授权已过期或失效，请重新点击知乎登录。')
  assert.equal(oauthErrorMessage('OAUTH_CANCELLED'), '你已取消知乎授权，可以重新登录。')
  for (const code of ['OAUTH_FAILED', '', '<script>untrusted</script>', 'upstream secret details']) {
    assert.equal(oauthErrorMessage(code), '知乎登录未完成，请重新授权登录。')
  }
})

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
    assert.equal(node.description, resources.reason)
    assert.equal(node.resourceStatus, resources.resourceStatus)
    assert.equal(node.resourceCount, resources.resources.length)
    assert.ok(resources.resources.length <= expected)
    if (!expected) assert.equal(resources.resourceStatus, 'NOT_APPLICABLE')
    if (resources.resourceStatus === 'READY') assert.equal(resources.resources.length, expected)
  }
})

test('resource cache coalesces reads, isolates login/session/node, and expires values', async () => {
  const { ResourceCache } = await server.ssrLoadModule('/src/api/resourceCache.ts')
  let now = 0, calls = 0
  const values = new ResourceCache(() => now, 30, 64)
  const load = async () => ++calls
  assert.deepEqual(await Promise.all([values.read('alice-login1', '1', '2', load), values.read('alice-login1', '1', '2', load)]), [1, 1])
  assert.equal(await values.read('alice-login1', '1', '2', load), 1)
  assert.equal(await values.read('alice-login2', '1', '2', load), 2)
  assert.equal(await values.read('bob-login', '1', '2', load), 3)
  assert.equal(await values.read('alice-login1', '3', '2', load), 4)
  assert.equal(await values.read('alice-login1', '1', '3', load), 5)
  now = 31
  assert.equal(await values.read('alice-login1', '1', '2', load), 6)
})

test('resource invalidation rejects late responses and failures can be retried', async () => {
  const { ResourceCache } = await server.ssrLoadModule('/src/api/resourceCache.ts')
  const values = new ResourceCache()
  let finish
  const pending = values.read('alice', '1', '2', () => new Promise(resolve => { finish = resolve }))
  await Promise.resolve()
  values.invalidateSession('1')
  finish('stale')
  await assert.rejects(pending, e => e.code === 'RESOURCE_CACHE_INVALIDATED')
  await assert.rejects(values.read('alice', '1', '2', async () => { throw new Error('network') }), /network/)
  assert.equal(await values.read('alice', '1', '2', async () => 'new'), 'new')
  values.clear()
  assert.equal(await values.read('alice', '1', '2', async () => 'after-logout'), 'after-logout')
})

test('node cards render descriptions and actual counts without waiting for a resource request', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { GraphNodeCard } = await server.ssrLoadModule('/src/components/result/GraphNodeCard.tsx')
  const node = { id: '1', name: '向量', description: '向量的说明', isTarget: false, level: 0,
    answer: 'DONT_KNOW', resourceLimit: 5, resourceStatus: 'READY', resourceCount: 2 }
  const render = changes => renderToStaticMarkup(createElement(GraphNodeCard, { node: { ...node, ...changes }, onOpen() {}, buttonRef() {} }))
  assert.ok(render({}).includes('向量的说明'))
  assert.ok(render({}).includes('查看 2 条资料'))
  assert.equal(render({}).includes('正在读取'), false)
  assert.equal(render({ resourceCount: 0 }).includes('graph-node-more'), false)
  assert.equal(render({ isTarget: true }).includes('graph-node-more'), false)
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

const { ApiError } = await server.ssrLoadModule('/src/api/types.ts')
const { startRecoverableRead, readRetryDelay } = await server.ssrLoadModule('/src/api/recoverableRead.ts')
const flush = () => new Promise(resolve => setImmediate(resolve))

test('answer drafts restore by user/session and reject changed questions, answers, expiry and corrupt data', async () => {
  const memory = new Map()
  globalThis.sessionStorage = { get length() { return memory.size }, key: i => [...memory.keys()][i] ?? null,
    getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
  const { writeAnswerDraft, restoreAnswerDraft, clearAnswerDraft, clearAnswerDrafts } = await server.ssrLoadModule('/src/components/quiz/answerDraft.ts')
  const base = [{ questionId: 'q1', nodeId: 'n1', nodeName: '向量', questionText: '熟悉吗？', hint: null,
    options: [{ value: 'DONT_KNOW', label: '不了解' }, { value: 'HEARD_OF', label: '听说过' }], answer: null }]
  const draft = [{ ...base[0], answer: 'DONT_KNOW' }]
  const save = () => assert.equal(writeAnswerDraft('u1', 's1', base, draft), true)
  save()
  assert.deepEqual(restoreAnswerDraft('u1', 's1', base), draft)
  assert.equal(restoreAnswerDraft('u2', 's1', base), base)
  assert.equal(restoreAnswerDraft('u1', 's2', base), base)
  assert.deepEqual(restoreAnswerDraft('u1', 's1', draft), draft, 'partially submitted answers are compatible')
  const changed = [{ ...base[0], questionText: '新的问题' }]
  assert.equal(restoreAnswerDraft('u1', 's1', changed), changed)
  assert.equal(memory.size, 0)
  save()
  const otherAnswer = [{ ...base[0], answer: 'HEARD_OF' }]
  assert.equal(restoreAnswerDraft('u1', 's1', otherAnswer), otherAnswer)
  for (const mutate of [value => { value.answers = ['INVALID'] }, value => { value.savedAt = 0 }]) {
    save(); const [key, raw] = [...memory][0]; const value = JSON.parse(raw); mutate(value); memory.set(key, JSON.stringify(value))
    assert.equal(restoreAnswerDraft('u1', 's1', base), base)
  }
  save(); memory.set([...memory.keys()][0], '{bad')
  assert.equal(restoreAnswerDraft('u1', 's1', base), base)
  save(); clearAnswerDraft('u1', 's1'); assert.equal(memory.size, 0)
  save(); memory.set('unrelated', 'keep'); clearAnswerDrafts(); assert.deepEqual([...memory], [['unrelated', 'keep']])
})

test('adjacent graph edges receive ordered lanes and separate node ports', async () => {
  const { routeGraphEdges } = await server.ssrLoadModule('/src/components/result/routeEdges.ts')
  const cards = [
    { id: 'a', left: 0, right: 200, top: 0, bottom: 200 },
    { id: 'b', left: 240, right: 440, top: 0, bottom: 200 },
    { id: 'c', left: 0, right: 200, top: 300, bottom: 500 },
    { id: 'd', left: 240, right: 440, top: 300, bottom: 500 },
  ]
  const edges = [
    { key: 'a-c', from: 'a', to: 'c', fromLevel: 0, toLevel: 1 },
    { key: 'a-d', from: 'a', to: 'd', fromLevel: 0, toLevel: 1 },
    { key: 'b-c', from: 'b', to: 'c', fromLevel: 0, toLevel: 1 },
    { key: 'b-d', from: 'b', to: 'd', fromLevel: 0, toLevel: 1 },
  ]
  const routes = routeGraphEdges(edges, cards)
  assert.equal(routes.length, edges.length)
  assert.equal(new Set(routes.map(route => route.points[1].y)).size, edges.length)
  assert.equal(new Set(routes.filter(route => route.from === 'a').map(route => route.points[0].x)).size, 2)
  assert.equal(new Set(routes.filter(route => route.to === 'c').map(route => route.points.at(-1).x)).size, 2)
  for (const route of routes) {
    assert.equal(route.points.length, 4)
    assert(route.points[1].y > 200 && route.points[1].y < 300)
  }
})

test('polling jitter, background cadence and visibility preserve retry cooldowns', async () => {
  let hidden = false, clock = 0, changed, unsubscribed = false
  const timers = [], recoveries = []
  const stop = startRecoverableRead({
    read: async () => { throw new ApiError(429, 'LIMIT', 'wait', 10) },
    onData: () => assert.fail('unexpected data'), onRecovery: value => recoveries.push(value),
    random: () => 0.5, now: () => clock,
    visibility: { isHidden: () => hidden, subscribe: fn => { changed = fn; return () => { unsubscribed = true } } },
    schedule: (callback, delay) => { const timer = { callback, delay, cancelled: false }; timers.push(timer); return () => { timer.cancelled = true } },
  })
  await flush()
  assert.equal(timers.at(-1).delay, 10500)
  hidden = true; changed()
  assert.equal(timers.at(-1).delay, 30500)
  assert.equal(timers[0].cancelled, true)
  clock = 3000; hidden = false; changed()
  assert.equal(timers.at(-1).delay, 7500, 'foreground must respect remaining Retry-After')
  for (let i = 0; i < 4; i++) { timers.at(-1).callback(); await flush() }
  assert.equal(recoveries.at(-1).retrying, false)
  const count = timers.length
  changed()
  assert.equal(timers.length, count, 'visibility must not revive exhausted retries')
  stop(); assert.equal(unsubscribed, true)
})

test('stopping a read aborts its pending operation without reporting a new error', async () => {
  let signal
  const recovery = []
  const stop = startRecoverableRead({
    read: value => { signal = value; return new Promise((resolve, reject) => value.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) },
    onData: () => assert.fail('late result'), onRecovery: value => recovery.push(value),
  })
  assert.equal(signal.aborted, false)
  stop(); await flush()
  assert.equal(signal.aborted, true)
  assert.deepEqual(recovery, [])
})

function readHarness(read, shouldPoll = () => false) {
  const data = []
  const recovery = []
  const timers = []
  const stop = startRecoverableRead({ read, shouldPoll, random: () => 0, onData: value => data.push(value), onRecovery: value => recovery.push(value),
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false }
      timers.push(timer)
      return () => { timer.cancelled = true }
    } })
  return { data, recovery, timers, stop, async advance() {
    const timer = timers.shift()
    assert.ok(timer && !timer.cancelled, 'an active retry should exist')
    timer.callback()
    await flush()
    return timer.delay
  } }
}

test('generation survives transient failures and reaches READY without replacing the task', async () => {
  const generating = { sessionId: 'recover-1', status: 'GENERATING_QUESTIONS' }
  const ready = { sessionId: 'recover-1', status: 'READY' }
  const responses = [generating, new TypeError('offline'), new ApiError(502, 'HTTP_ERROR', 'gateway'), ready]
  const reads = []
  const harness = readHarness(async () => {
    reads.push('recover-1')
    const next = responses.shift()
    if (next instanceof Error) throw next
    return next
  }, value => value.status === 'GENERATING_QUESTIONS')
  await flush()
  assert.deepEqual(harness.data, [generating])
  assert.equal(await harness.advance(), 2000)
  assert.equal(harness.recovery.at(-1).retrying, true)
  assert.deepEqual(harness.data, [generating], 'known generation state must not be cleared on a failed read')
  assert.equal(await harness.advance(), 2000)
  assert.equal(await harness.advance(), 4000)
  assert.deepEqual(harness.data, [generating, ready])
  assert.deepEqual(reads, ['recover-1', 'recover-1', 'recover-1', 'recover-1'])
  assert.equal(harness.recovery.at(-1).error, null)
  assert.equal(harness.timers.length, 0)
  harness.stop()
})

test('transient read retries stop after four retries and manual restart keeps the same operation', async () => {
  let calls = 0
  const read = async () => { calls++; throw new ApiError(0, 'INVALID_RESPONSE', 'bad JSON') }
  const harness = readHarness(read)
  await flush()
  const delays = []
  while (harness.timers.length) delays.push(await harness.advance())
  assert.deepEqual(delays, [2000, 4000, 8000, 16000])
  assert.equal(calls, 5)
  assert.equal(harness.recovery.at(-1).retrying, false)
  harness.stop()
  const manual = readHarness(read)
  await flush()
  assert.equal(calls, 6)
  manual.stop()
})

test('terminal access errors, cancellation and actual FAILED task responses are not retried', async () => {
  for (const status of [401, 403, 404, 410]) {
    const harness = readHarness(async () => { throw new ApiError(status, 'ACCESS_ERROR', 'no access') })
    await flush()
    assert.equal(harness.timers.length, 0)
    assert.equal(harness.recovery.at(-1).retrying, false)
    harness.stop()
  }
  for (const code of ['REQUEST_CANCELLED', 'AUTH_CHANGED']) assert.equal(readRetryDelay(new ApiError(0, code, code), 1), null)
  const failed = { status: 'FAILED', error: { code: 'GRAPH_INVALID', message: 'unable to generate' } }
  const harness = readHarness(async () => failed, value => value.status.startsWith('GENERATING'))
  await flush()
  assert.deepEqual(harness.data, [failed])
  assert.equal(harness.timers.length, 0)
  harness.stop()
})

test('unmount cancels scheduled retries and ignores late responses from the previous task', async () => {
  let resolve
  const late = readHarness(() => new Promise(done => { resolve = done }))
  late.stop()
  resolve({ sessionId: 'old-user-task', status: 'READY' })
  await flush()
  assert.deepEqual(late.data, [])
  assert.deepEqual(late.recovery, [])
  let calls = 0
  const waiting = readHarness(async () => { calls++; throw new TypeError('offline') })
  await flush()
  waiting.stop()
  assert.equal(waiting.timers[0].cancelled, true)
  waiting.timers[0].callback()
  await flush()
  assert.equal(calls, 1)
})

test('invalid JSON and invalid question shapes recover through the real response validator', async () => {
  const originalFetch = globalThis.fetch
  const auth = await server.ssrLoadModule('/src/api/auth.ts')
  const real = await server.ssrLoadModule('/src/api/real/sessions.ts')
  let user
  let calls = 0
  const question = { questionId: 'q1', nodeId: 'n1', nodeName: '向量', questionText: '熟悉向量吗？', hint: null, options: [{ value: 'DONT_KNOW', label: '不了解' }], checks: {}, answer: null }
  try {
    globalThis.fetch = async url => {
      if (String(url).endsWith('/auth/me')) return new Response(JSON.stringify({ userId: 'recover-user', csrfToken: 'recover-csrf' }))
      assert.ok(String(url).endsWith('/recover-2/questions'))
      calls++
      if (calls === 1) return new Response('{"questions":')
      if (calls === 2) return new Response(JSON.stringify({ questions: 'not-an-array' }))
      return new Response(JSON.stringify({ questions: [question] }))
    }
    user = await auth.ensureCurrentUser()
    const harness = readHarness(() => real.getQuestions('recover-2'))
    await flush()
    assert.equal(harness.recovery.at(-1).error.code, 'INVALID_RESPONSE')
    await harness.advance()
    assert.equal(harness.recovery.at(-1).error.code, 'INVALID_RESPONSE')
    await harness.advance()
    assert.deepEqual(harness.data, [{ questions: [question] }])
    assert.equal(calls, 3)
    harness.stop()
  } finally { if (user) auth.invalidateCurrentUser(user); globalThis.fetch = originalFetch }
})

test('HTML rate-limit and proxy errors retain Retry-After for bounded backoff', async () => {
  const originalFetch = globalThis.fetch
  const { apiJson } = await server.ssrLoadModule('/src/api/http.ts')
  try {
    for (const status of [429, 503]) {
      globalThis.fetch = async () => new Response('<html>temporarily unavailable</html>', { status, headers: { 'Retry-After': '7' } })
      await assert.rejects(apiJson('/test', { method: 'GET' }, value => value), error => {
        assert.equal(error.status, status)
        assert.equal(error.retryAfterSeconds, 7)
        assert.equal(readRetryDelay(error, 1), 7000)
        return true
      })
    }
    assert.equal(readRetryDelay(new ApiError(429, 'LIMIT', 'wait', 120), 1), null)
  } finally { globalThis.fetch = originalFetch }
})

test('a late task response is rejected after authentication changes', async () => {
  const originalFetch = globalThis.fetch
  const auth = await server.ssrLoadModule('/src/api/auth.ts')
  const real = await server.ssrLoadModule('/src/api/real/sessions.ts')
  let user
  let release
  try {
    globalThis.fetch = async url => {
      if (String(url).endsWith('/auth/me')) return new Response(JSON.stringify({ userId: 'previous-owner', csrfToken: 'previous-csrf' }))
      return new Promise(resolve => { release = resolve })
    }
    user = await auth.ensureCurrentUser()
    const harness = readHarness(() => real.getSession('old-task'))
    await flush()
    auth.invalidateCurrentUser(user)
    release(new Response(JSON.stringify({ sessionId: 'old-task', target: 'private target', status: 'READY', progress: { processedNodes: 1, totalNodes: 1 }, warnings: [], error: null })))
    await flush()
    assert.equal(harness.recovery.at(-1).error.code, 'AUTH_CHANGED')
    assert.deepEqual(harness.data, [])
    assert.equal(harness.timers.length, 0)
    harness.stop()
  } finally { if (user) auth.invalidateCurrentUser(user); globalThis.fetch = originalFetch }
})

test('transient recovery notice keeps an inline retry action rather than a failure or home dialog', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { MemoryRouter } = await import('react-router-dom')
  const { SessionReadNotice } = await server.ssrLoadModule('/src/components/ui/SessionReadNotice.tsx')
  for (const retrying of [true, false]) {
    const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/sessions/100/questions'] },
      createElement(SessionReadNotice, { error: new ApiError(502, 'HTTP_ERROR', 'gateway'), retrying,
        retryDelayMs: retrying ? 2000 : null, reload() {}, label: '读取问卷' })))
    assert.ok(html.includes(retrying ? '正在恢复' : '重试读取'))
    assert.ok(html.includes(retrying ? '当前寻路已保留' : '无需重新创建'))
    assert.equal(html.includes('寻路失败'), false)
    assert.equal(html.includes('回到首页'), false)
    assert.equal(html.includes('role="dialog"'), false)
  }
})
