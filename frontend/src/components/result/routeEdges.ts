export interface NodeRect { id: string; left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }

// Orthogonal visibility grid: every segment must stay outside the padded card rectangles.
export function routeEdge(from: NodeRect, to: NodeRect, cards: NodeRect[]): Point[] {
  const gap = 10
  const obstacles = cards.map(r => ({ ...r, left: r.left - gap, right: r.right + gap, top: r.top - gap, bottom: r.bottom + gap }))
  const start = { x: (from.left + from.right) / 2, y: from.bottom + gap }
  const end = { x: (to.left + to.right) / 2, y: to.top - gap }
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(r => [r.left, r.right])])].sort((a,b) => a-b)
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(r => [r.top, r.bottom])])].sort((a,b) => a-b)
  const width = xs.length
  const index = (p: Point) => ys.indexOf(p.y) * width + xs.indexOf(p.x)
  const point = (i: number) => ({ x: xs[i % width], y: ys[Math.floor(i / width)] })
  const blocked = (a: Point, b: Point) => obstacles.some(r => a.x === b.x
    ? a.x > r.left && a.x < r.right && Math.max(a.y,b.y) > r.top && Math.min(a.y,b.y) < r.bottom
    : a.y > r.top && a.y < r.bottom && Math.max(a.x,b.x) > r.left && Math.min(a.x,b.x) < r.right)
  const source = index(start) * 3, target = index(end)
  const at = (state: number) => Math.floor(state / 3)
  const distances = new Map<number,number>([[source,0]])
  const previous = new Map<number,number>()
  const open = new Set([source])
  while (open.size) {
    let current = -1, best = Infinity
    for (const i of open) {
      const p = point(at(i))
      const score = distances.get(i)! + Math.abs(p.x-end.x) + Math.abs(p.y-end.y)
      if (score < best) { best = score; current = i }
    }
    if (at(current) === target) {
      const path = [end]
      for (let i = current; i !== source;) { i = previous.get(i)!; path.push(point(at(i))) }
      path.reverse()
      return path.filter((p,i) => i === 0 || i === path.length-1 ||
        !((path[i-1].x === p.x && p.x === path[i+1].x) || (path[i-1].y === p.y && p.y === path[i+1].y)))
    }
    open.delete(current)
    const cell = at(current)
    const x = cell % width, y = Math.floor(cell / width)
    const neighbors = [x > 0 ? cell-1 : -1, x+1 < width ? cell+1 : -1,
      y > 0 ? cell-width : -1, y+1 < ys.length ? cell+width : -1]
    const a = point(cell)
    for (const next of neighbors) {
      if (next < 0) continue
      const b = point(next)
      if ((end.y >= start.y && b.y < a.y) || blocked(a,b)) continue
      const direction = a.x === b.x ? 2 : 1
      const nextState = next * 3 + direction
      const turnCost = current % 3 !== 0 && current % 3 !== direction ? 100 : 0
      const distance = distances.get(current)! + Math.abs(a.x-b.x) + Math.abs(a.y-b.y) + turnCost
      if (distance < (distances.get(nextState) ?? Infinity)) {
        distances.set(nextState,distance); previous.set(nextState,current); open.add(nextState)
      }
    }
  }
  return [] // Never substitute a straight line through a card.
}
