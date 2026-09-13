import test from 'node:test'
import assert from 'node:assert/strict'
import { analyticsPage } from '../src/components/analytics/pageview.ts'
import { dailyCsv, weekdayValues } from '../src/components/analytics/dashboardData.ts'
import { safeReturnTo } from '../src/api/loginNavigation.ts'

test('only reports coarse page categories without session identifiers', () => {
  assert.equal(analyticsPage('/login'), 'login')
  assert.equal(analyticsPage('/'), 'home')
  assert.equal(analyticsPage('/history'), 'history')
  assert.equal(analyticsPage('/sessions/123456789/questions'), 'questions')
  assert.equal(analyticsPage('/sessions/987654321/result'), 'result')
})
test('never reports admin, OAuth callback or unknown routes', () => {
  for (const path of ['/admin/analytics', '/api/v1/auth/zhihu/callback', '/unknown', '/sessions/secret']) {
    assert.equal(analyticsPage(path), null)
  }
})
test('weekday grouping follows the supplied Beijing calendar date', () => {
  assert.deepEqual(weekdayValues([{ day: '2026-09-13', pv: 2, uv: 1, ip: 1 }, { day: '2026-09-07', pv: 3, uv: 2, ip: 1 }]), [3, 0, 0, 0, 0, 0, 2])
})
test('daily CSV has UTF-8 BOM and ascending dates', () => {
  const csv = dailyCsv([{ day: '2026-09-13', pv: 2, uv: 1, ip: 1 }, { day: '2026-09-12', pv: 0, uv: 0, ip: 0 }])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.indexOf('2026-09-12') < csv.indexOf('2026-09-13'))
})
test('admin dashboard survives login navigation without opening arbitrary redirects', () => {
  assert.equal(safeReturnTo('/admin/analytics'), '/admin/analytics')
  assert.equal(safeReturnTo('//outside.example/admin/analytics'), '/')
  assert.equal(safeReturnTo('/admin/analytics?redirect=https://outside.example'), '/')
})
