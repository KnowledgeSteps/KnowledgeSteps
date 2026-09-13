import { test } from 'node:test'
import assert from 'node:assert/strict'
import { constrainGraph, fitGraph, GRAPH_INSET, zoomGraph } from '../src/components/result/graphTransform.ts'

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`)

test('wide, tall and late-expanded trees fit inside narrow phones without clipping', () => {
  for (const width of [288, 358, 408, 728]) {
    for (const content of [{ width: 1628, height: 1800 }, { width: 656, height: 5200 }, { width: 1628, height: 7000 }]) {
      const viewport = { width, height: 510 }
      const view = fitGraph(content, viewport)
      assert.ok(view.scale > 0 && view.scale <= 1)
      assert.ok(view.x >= GRAPH_INSET - 0.000001 && view.y >= GRAPH_INSET - 0.000001)
      assert.ok(view.x + content.width * view.scale <= width - GRAPH_INSET + 0.000001)
      assert.ok(view.y + content.height * view.scale <= viewport.height - GRAPH_INSET + 0.000001)
    }
  }
})

test('small graphs stay at natural size and centered', () => {
  assert.deepEqual(fitGraph({ width: 100, height: 200 }, { width: 400, height: 600 }), { x: 150, y: 200, scale: 1 })
})

test('pinch follows a moving midpoint without changing the knowledge point under the fingers', () => {
  const start = { scale: 0.25, x: -40, y: 20 }
  const fingerStart = { x: 130, y: 270 }
  const fingerEnd = { x: 160, y: 220 }
  const zoomed = zoomGraph(start, 0.8, fingerStart, fingerEnd)
  close((fingerStart.x - start.x) / start.scale, (fingerEnd.x - zoomed.x) / zoomed.scale)
  close((fingerStart.y - start.y) / start.scale, (fingerEnd.y - zoomed.y) / zoomed.scale)
})

test('pan bounds keep the graph reachable at all four edges', () => {
  const content = { width: 1000, height: 1200 }
  const viewport = { width: 390, height: 560 }
  assert.deepEqual(constrainGraph({ scale: 1, x: 9000, y: 9000 }, content, viewport), { scale: 1, x: 16, y: 16 })
  assert.deepEqual(constrainGraph({ scale: 1, x: -9000, y: -9000 }, content, viewport), { scale: 1, x: -626, y: -656 })
  assert.deepEqual(constrainGraph({ scale: 1, x: -100, y: -200 }, content, viewport), { scale: 1, x: -100, y: -200 })
})

test('returning to fit centers both axes even after a large pan', () => {
  const content = { width: 1628, height: 2400 }
  const viewport = { width: 358, height: 510 }
  const fit = fitGraph(content, viewport)
  const bounded = constrainGraph({ ...fit, x: -10000, y: 10000 }, content, viewport)
  close(bounded.x, fit.x)
  close(bounded.y, fit.y)
})
