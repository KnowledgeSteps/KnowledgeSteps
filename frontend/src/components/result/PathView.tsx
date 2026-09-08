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
    return (
      <section className="all-clear enter">
        <span className="badge">可以直接开始</span>
        <h2>所有前置知识都已掌握</h2>
        <p>
          你不需要再补前置内容，可以从目标知识
          <em>「{result.target}」</em> 开始学习。第一版不会为目标搜索资料。
        </p>
      </section>
    )
  }

  return (
    <section className="path" aria-label="待补齐知识路径">
      {levels.map((level, index) => {
        const nodes = rows.get(level) ?? []
        return (
          <div className="path-level" key={level}>
            <div className={`path-row ${nodes.length === 1 ? 'single' : ''}`}>
              {nodes.map((node) => (
                <button
                  type="button"
                  key={node.id}
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
            {index < levels.length - 1 && (
              <div className="path-connector" aria-hidden="true">
                <i />
                <span>↓</span>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
