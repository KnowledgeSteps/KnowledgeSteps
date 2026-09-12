import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resourceMathExcerpt } from '../src/components/result/resourceMath.ts'
import katex from 'katex'

test('renders the bare matrix environment supplied by the resource API', () => {
  const parts = resourceMathExcerpt(String.raw`当\begin{pmatrix}4 & 5 & 6 \\ 7 & 8 & 9\end{pmatrix}矩阵`)
  const formula = parts.find(p => p.math)
  assert.ok(formula)
  assert.match(katex.renderToString(formula.text, { trust: false }), /class="katex"/)
  assert.equal(parts[0].text, '当')
})
test('preserves newlines and supports explicit math delimiters', () => {
  const parts = resourceMathExcerpt('介绍\r\n$x^2$\n\\(y+1\\)')
  assert.equal(parts[0].text, '介绍\n')
  assert.deepEqual(parts.filter(p => p.math).map(p => p.text), ['x^2', 'y+1'])
})
test('does not cut a formula or split Unicode characters at the excerpt boundary', () => {
  const parts = resourceMathExcerpt('😀'.repeat(190) + String.raw`\begin{pmatrix}1 & 2\end{pmatrix}`)
  assert.equal(parts.some(p => p.math), false)
  assert.equal(Array.from(parts.map(p => p.text).join('')).length, 191)
  assert.equal(parts.at(-1).text, '…')
})
test('incomplete environments are omitted and HTML remains plain text', () => {
  assert.deepEqual(resourceMathExcerpt(String.raw`简介\begin{pmatrix}1 & 2`), [{text:'简介',math:false},{text:'…',math:false}])
  assert.equal(resourceMathExcerpt('<img src=x onerror=alert(1)>')[0].math, false)
  assert.equal(resourceMathExcerpt('a'.repeat(201)).map(p=>p.text).join('').length, 200)
})
