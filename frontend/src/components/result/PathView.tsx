import { useLayoutEffect, useRef, useState } from 'react'
import type { CompletionResult, KnowledgeNode } from '../../api/types'

interface PathViewProps {
  result: CompletionResult
  onOpenNode: (node: KnowledgeNode) => void
}

export function PathView({ result, onOpenNode }: PathViewProps) {
  const rows = new Map<number, KnowledgeNode[]>()
  for (const node of result.nodes) {
    const list = rows.get(node.level) ?? []
    list.push(node)
    rows.set(node.level, list)
  }
  const levels = [...rows.keys()].sort((a, b) => a - b)

  if (result.missingCount === 0 && result.nodes.length === 1) {
    const target = result.nodes[0]
    return (
      <section className="all-clear enter">
        <span className="badge">可以直接开始</span>
        <h2>所有前置知识都已掌握</h2>
        <p>
          你不需要再补前置内容，可以从目标知识
          <em>「{result.target}」</em> 开始学习。第一版不会为目标搜索资料。
        </p>
        <button
          type="button"
          className="node-card target all-clear-target"
          onClick={() => onOpenNode(target)}
        >
          <span className="node-tag">学习目标</span>
          <strong>{target.name}</strong>
          <small>查看目标说明</small>
        </button>
      </section>
    )
  }

  return (
    <DependencyGraph
      result={result}
      onOpenNode={onOpenNode}
      rows={rows}
      levels={levels}
    />
  )
}

function DependencyGraph({
  result,
  onOpenNode,
  rows,
  levels,
}: PathViewProps & {
  rows: Map<number, KnowledgeNode[]>
  levels: number[]
}) {
  const graphRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())
  const [lines, setLines] = useState<PathLine[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const graph = graphRef.current
        if (!graph) return
        const graphRect = graph.getBoundingClientRect()
        const nextLines = result.edges.flatMap((edge, index) => {
          const from = nodeRefs.current.get(edge.from)
          const to = nodeRefs.current.get(edge.to)
          if (!from || !to) return []
          const fromRect = from.getBoundingClientRect()
          const toRect = to.getBoundingClientRect()
          return [
            {
              key: `${edge.from}-${edge.to}-${index}`,
              x1: fromRect.left + fromRect.width / 2 - graphRect.left,
              y1: fromRect.bottom - graphRect.top,
              x2: toRect.left + toRect.width / 2 - graphRect.left,
              y2: toRect.top - graphRect.top,
            },
          ]
        })
        setLines(nextLines)
        setSize({ width: graphRect.width, height: graphRect.height })
      })
    }

    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (graphRef.current) observer?.observe(graphRef.current)
    for (const node of nodeRefs.current.values()) observer?.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [result.edges, result.nodes])

  const names = new Map(result.nodes.map((node) => [node.id, node.name]))
  const visibleEdges = result.edges.filter(
    (edge) => names.has(edge.from) && names.has(edge.to),
  )

  return (
    <section className="path" aria-label="待补齐知识路径">
      <div className="path-graph" ref={graphRef}>
        <svg
          className="path-edges"
          viewBox={`0 0 ${size.width} ${size.height}`}
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <marker
              id="path-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" />
            </marker>
          </defs>
          {lines.map((line) => (
            <path
              key={line.key}
              d={`M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`}
              markerEnd="url(#path-arrow)"
            />
          ))}
        </svg>
        {levels.map((level) => {
          const nodes = rows.get(level) ?? []
          return (
            <div className="path-level" key={level}>
              <span className="path-level-label">第 {level + 1} 级</span>
              <div className={`path-row ${nodes.length === 1 ? 'single' : ''}`}>
                {nodes.map((node) => (
                  <button
                    type="button"
                    key={node.id}
                    ref={(element) => {
                      if (element) nodeRefs.current.set(node.id, element)
                      else nodeRefs.current.delete(node.id)
                    }}
                    className={`node-card ${node.isTarget ? 'target' : ''}`}
                    onClick={() => onOpenNode(node)}
                  >
                    <span className="node-tag">
                      {node.isTarget ? '学习目标' : '待补齐'}
                    </span>
                    <strong>{node.name}</strong>
                    <small>点击查看学习资料</small>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {visibleEdges.length > 0 && (
        <div className="path-dependencies" aria-label="实际依赖关系">
          <span>依赖关系</span>
          <ul>
            {visibleEdges.map((edge) => (
              <li key={`${edge.from}-${edge.to}`}>
                {names.get(edge.from)}{' '}
                <span aria-hidden="true">→</span>{' '}
                {names.get(edge.to)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

interface PathLine {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
}
