import assert from 'node:assert/strict'
import test from 'node:test'
import { createLoadingController, LOADING_FADE_MS } from '../src/components/ui/loadingController.ts'

function fixture() {
  let now = 0
  let sequence = 0
  const jobs = new Map()
  const controller = createLoadingController({
    now: () => now,
    schedule(callback, milliseconds) { const id = ++sequence; jobs.set(id, { at: now + milliseconds, callback }); return id },
    cancel(id) { jobs.delete(id) },
  })
  return { controller, advance(ms) {
    const end = now + ms
    while (true) {
      const next = [...jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= end)
      if (!next) break
      jobs.delete(next[0]); now = next[1].at; next[1].callback()
    }
    now = end
  } }
}

test('fast completion stays visible for a full 2-second cycle', () => {
  const { controller: c, advance } = fixture()
  const end = c.begin('login'); advance(100); end()
  advance(1899); assert.equal(c.getSnapshot().visible, true)
  advance(1); assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
})

test('slow requests keep looping and finish when ready', () => {
  const { controller: c, advance } = fixture()
  const end = c.begin('login'); advance(6500)
  assert.equal(c.getSnapshot().visible, true)
  end(); advance(0); assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
})

test('login-to-home handoff shares the original cycle without a gap', () => {
  const { controller: c, advance } = fixture()
  const endLogin = c.begin('login'); advance(500); endLogin()
  const endHome = c.begin('home'); advance(1000); endHome()
  advance(499); assert.equal(c.getSnapshot().visible, true)
  assert.equal(c.getSnapshot().label, 'home')
  advance(1); assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
})

test('a new request cancels pending dismissal and overlapping requests remain covered', () => {
  const { controller: c, advance } = fixture()
  const endFirst = c.begin('first'); advance(100); endFirst()
  advance(1800); const endSecond = c.begin('second'); const endThird = c.begin('third')
  advance(500); endThird(); assert.equal(c.getSnapshot().label, 'second')
  advance(1000); assert.equal(c.getSnapshot().visible, true)
  endSecond(); advance(0); assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
})

test('StrictMode cleanup replay is safe; a separate episode gets its own cycle', () => {
  const { controller: c, advance } = fixture()
  const cleanup = c.begin('boot'); cleanup(); cleanup()
  const end = c.begin('boot'); end(); advance(2000)
  assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
  advance(1000); const endNew = c.begin('login'); endNew()
  advance(1999); assert.equal(c.getSnapshot().visible, true)
  advance(1); assert.equal(c.getSnapshot().fading, true)
  assert.equal(c.getSnapshot().visible, true)
  advance(LOADING_FADE_MS); assert.equal(c.getSnapshot().visible, false)
})


test('a new request during fade cancels removal and restores the overlay', () => {
  const { controller: c, advance } = fixture()
  const end = c.begin('first'); end(); advance(2000)
  assert.equal(c.getSnapshot().fading, true)
  advance(150); const endNext = c.begin('second')
  assert.equal(c.getSnapshot().fading, false)
  advance(1000); assert.equal(c.getSnapshot().visible, true)
  endNext(); advance(0); assert.equal(c.getSnapshot().fading, true)
  advance(LOADING_FADE_MS - 1); assert.equal(c.getSnapshot().visible, true)
  advance(1); assert.equal(c.getSnapshot().visible, false)
})
