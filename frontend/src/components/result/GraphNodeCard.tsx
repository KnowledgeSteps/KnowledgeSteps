import { AimOutlined, BookOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import type { KnowledgeNode } from '../../api/types'
import '../../design/graph-node.css'

export function GraphNodeCard({ node, onOpen, buttonRef }: {
  node: KnowledgeNode
  onOpen: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
}) {
  const hasNoResources = node.resourceCount === 0
  const label = `查看 ${node.resourceCount} 条资料`
  return <Button className="graph-node-parent" htmlType="button" ref={element => buttonRef(element instanceof HTMLButtonElement ? element : null)}
    onClick={onOpen} aria-label={`${node.name}，${node.isTarget || hasNoResources ? '查看节点说明' : label}`}>
    <span className="graph-node-card">
      <span className="graph-node-content-box">
        <span className="graph-node-title">{node.name}</span>
        <span className="graph-node-description">{node.description || '暂无节点描述'}</span>
        {!node.isTarget && !hasNoResources && <span className="graph-node-more">{label}</span>}
      </span>
      <span className="graph-node-icon-box" aria-hidden="true">{node.isTarget ? <AimOutlined /> : <BookOutlined />}</span>
    </span>
  </Button>
}
