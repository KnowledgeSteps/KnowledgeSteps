export interface NodeRect { id: string; left: number; top: number; right: number; bottom: number }
export interface Point { x: number; y: number }
export interface GraphEdgeRoute { key: string; from: string; to: string; fromLevel: number; toLevel: number }
export interface RoutedGraphEdge extends GraphEdgeRoute { points: Point[] }

const centerX = (rect: NodeRect) => (rect.left + rect.right) / 2

function distributePorts(edges: GraphEdgeRoute[], cards: Map<string, NodeRect>, endpoint: 'from' | 'to') {
  const ports = new Map<string, number>()
  const groups = new Map<string, GraphEdgeRoute[]>()
  for (const edge of edges) {
    const id = edge[endpoint]
    groups.set(id, [...(groups.get(id) ?? []), edge])
  }
  for (const [id, group] of groups) {
    const card = cards.get(id)
    if (!card) continue
    const other = endpoint === 'from' ? 'to' : 'from'
    group.sort((a, b) => centerX(cards.get(a[other])!) - centerX(cards.get(b[other])!) || a.key.localeCompare(b.key))
    const usableLeft = card.left + Math.min(28, (card.right - card.left) * .16)
    const usableRight = card.right - Math.min(28, (card.right - card.left) * .16)
    group.forEach((edge, index) => {
      const ratio = group.length === 1 ? .5 : (index + 1) / (group.length + 1)
      ports.set(edge.key, usableLeft + (usableRight - usableLeft) * ratio)
    })
  }
  return ports
}

/**
 * Routes adjacent levels as one batch. Each edge gets a stable lane and its own
 * card port, so independent shortest-path searches cannot collapse into one line.
 * Skipped-level edges keep the obstacle-aware router below.
 */
export function routeGraphEdges(edges: GraphEdgeRoute[], cardList: NodeRect[]): RoutedGraphEdge[] {
  const cards = new Map(cardList.map(card => [card.id, card]))
  const validEdges = edges.filter(edge => cards.has(edge.from) && cards.has(edge.to))
  const startPorts = distributePorts(validEdges, cards, 'from')
  const endPorts = distributePorts(validEdges, cards, 'to')
  const groups = new Map<string, GraphEdgeRoute[]>()
  for (const edge of validEdges) {
    const key = `${edge.fromLevel}:${edge.toLevel}`
    groups.set(key, [...(groups.get(key) ?? []), edge])
  }
  const routed: RoutedGraphEdge[] = []
  for (const group of groups.values()) {
    const valid = group.filter(edge => cards.has(edge.from) && cards.has(edge.to))
    const adjacent = valid.every(edge => edge.toLevel === edge.fromLevel + 1)
    const top = Math.max(...valid.map(edge => cards.get(edge.from)!.bottom)) + 10
    const bottom = Math.min(...valid.map(edge => cards.get(edge.to)!.top)) - 10
    const canUseBand = valid.length > 0 && adjacent && bottom > top
    const ordered = [...valid].sort((a, b) => {
      const aFrom = startPorts.get(a.key)!, aTo = endPorts.get(a.key)!
      const bFrom = startPorts.get(b.key)!, bTo = endPorts.get(b.key)!
      return (aFrom + aTo) - (bFrom + bTo) || aFrom - bFrom || a.key.localeCompare(b.key)
    })
    ordered.forEach((edge, index) => {
      const from = cards.get(edge.from)!, to = cards.get(edge.to)!
      if (!canUseBand) {
        const inner = routeEdge(from, to, cardList)
        if (inner.length) routed.push({ ...edge, points: [{ x: centerX(from), y: from.bottom }, ...inner, { x: centerX(to), y: to.top }] })
        return
      }
      const startX = startPorts.get(edge.key)!
      const endX = endPorts.get(edge.key)!
      const laneY = top + ((index + 1) / (ordered.length + 1)) * (bottom - top)
      routed.push({ ...edge, points: [
        { x: startX, y: from.bottom },
        { x: startX, y: laneY },
        { x: endX, y: laneY },
        { x: endX, y: to.top },
      ] })
    })
  }
  return routed
}

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
