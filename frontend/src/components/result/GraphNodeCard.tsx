import { AimOutlined, BookOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useEffect, useState } from 'react'
import { getNodeResources } from '../../api/sessions'
import type { KnowledgeNode, NodeResources } from '../../api/types'
import '../../design/graph-node.css'

export function GraphNodeCard({ sessionId, node, onOpen, buttonRef }: {
  sessionId: string
  node: KnowledgeNode
  onOpen: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
}) {
  const [detail, setDetail] = useState<NodeResources | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    getNodeResources(sessionId, node.id).then(value => {
      if (!cancelled) setDetail(value)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [sessionId, node.id])
  const hasNoResources = detail !== null && detail.resources.length === 0
  const label = detail ? `查看 ${detail.resources.length} 条资料` : failed ? '点击重试查看资料' : '正在读取资料…'
  return <Button className="graph-node-parent" htmlType="button" ref={element => buttonRef(element instanceof HTMLButtonElement ? element : null)}
    onClick={onOpen} aria-label={`${node.name}，${node.isTarget || hasNoResources ? '查看节点说明' : label}`}>
    <span className="graph-node-card">
      <span className="graph-node-content-box">
        <span className="graph-node-title">{node.name}</span>
        <span className="graph-node-description">{detail?.reason || (detail ? '暂无节点描述' : failed ? '节点说明暂未加载，点击查看详情。' : '正在读取节点描述…')}</span>
        {!node.isTarget && !hasNoResources && <span className="graph-node-more">{label}</span>}
      </span>
      <span className="graph-node-icon-box" aria-hidden="true">{node.isTarget ? <AimOutlined /> : <BookOutlined />}</span>
    </span>
  </Button>
}
