import '../../design/reading.css'
import { useEffect, useState } from 'react'
import { ArrowRightOutlined, ReloadOutlined, LikeOutlined } from '@ant-design/icons'
import { Button, Drawer, Spin, Tag } from 'antd'
import type { KnowledgeNode, NodeResources } from '../../api/types'
import { getNodeResources } from '../../api/sessions'
import { isMockMode } from '../../api/config'
import { ReadingCard } from '../ui/ReadingCard'
import { NodeOverview } from '../reading/NodeOverview'
import { ReadingModal } from '../reading/ReadingModal'
import { OriginalArticleButton } from '../reading/OriginalArticleButton'
import type { ReadingSource } from '../reading/ReadingModal'

interface ResourcesDrawerProps { sessionId: string; node: KnowledgeNode | null; onClose: () => void }

export function ResourcesDrawer({ sessionId, node, onClose }: ResourcesDrawerProps) {
  return <Drawer title={node?.name ?? ''} placement="right" open={Boolean(node)} onClose={onClose}
    size="min(720px, 96vw)" className="path-drawer reading-drawer" styles={{ body: { padding: 0 } }}>
    {node && <NodeResourcesPanel key={`${sessionId}:${node.id}`} sessionId={sessionId} node={node} />}
  </Drawer>
}

function NodeResourcesPanel({ sessionId, node }: { sessionId: string; node: KnowledgeNode }) {
  const [data, setData] = useState<NodeResources | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [reading, setReading] = useState<ReadingSource | null>(null)
  useEffect(() => {
    let cancelled = false
    const request = node.resourceCount === 0 && node.resourceStatus !== 'PENDING'
      ? Promise.resolve({ nodeId: node.id, nodeName: node.name, reason: node.description,
        resourceStatus: node.resourceStatus, resources: [] } satisfies NodeResources)
      : getNodeResources(sessionId, node.id)
    request.then(payload => { if (!cancelled) setData(payload) })
      .catch(() => { if (!cancelled) setError('资料暂时无法加载，请重试。') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId, node.id, node.name, node.description, node.resourceStatus, node.resourceCount, retryKey])
  function retry() { setData(null); setError(null); setLoading(true); setRetryKey(value => value + 1) }
  const status = data?.resourceStatus
  const statusMessage = status === 'EMPTY' ? '暂时没有找到匹配的知乎资料，可以先阅读知识点卡片。'
    : status === 'FAILED' ? '资料搜索暂时失败，可以先阅读知识点卡片，或查看其他节点。'
    : status === 'PENDING' ? '资料仍在整理中，请稍后刷新。' : null
  return <div className="drawer-body reading-node-panel">
    <p className="reading-node-description">{node.description}</p>
    <NodeOverview sessionId={sessionId} node={node} />
    <section className="reading-resources" aria-labelledby={`resources-title-${node.id}`}>
      <div className="reading-section-heading"><h3 id={`resources-title-${node.id}`}>相关资料</h3>
        {data && <span className="reading-muted">{data.resources.length} 条</span>}</div>
      {loading ? <div className="reading-loading" role="status"><Spin /><span>正在加载资料…</span></div>
        : error ? <ReadingCard className="reading-state"><h4>资料加载失败</h4><p role="alert">{error}</p>
          <Button icon={<ReloadOutlined />} onClick={retry}>重新加载</Button></ReadingCard>
          : status === 'NOT_APPLICABLE' ? <div className="reading-empty-note">
            {!node.isTarget && <Tag>非常了解 · 已掌握</Tag>}
            <p>{node.isTarget ? '这个节点是学习目标，可以通过知识点卡片了解整体内容。' : '已了解的知识点无需重复阅读资料，可按需查看上方讲解。'}</p>
          </div>
            : statusMessage ? <ReadingCard className="reading-state"><p>{statusMessage}</p>
              {status === 'PENDING' && <Button icon={<ReloadOutlined />} onClick={retry}>刷新资料</Button>}</ReadingCard>
              : <div className="reading-resource-list">
                {isMockMode && <p className="reading-muted">本地演示资料，链接用于检索相关讨论。</p>}
                {data?.resources.map((item, index) => {
                  const title = item.title.replace(/\s*-\s*知乎\s*$/, '')
                  const characters = Array.from((item.summary ?? '').replace(/\s+/g, ' ').trim())
                  const preview = characters.length ? `${characters.slice(0, 50).join('')}${characters.length > 50 ? '…' : ''}` : '暂未提供内容摘要，可在阅读页打开知乎原文。'
                  return <ReadingCard className="reading-resource-card" key={item.id}>
                    <Button type="text" className="reading-resource-trigger" onClick={() => setReading({
                      kind: 'summary', resourceId: item.id, title, text: item.summary ?? '',
                      sourceUrl: item.url, authorName: item.authorName, authorUrl: item.authorUrl, contentDate: item.contentDate, voteCount: item.voteCount,
                    })} aria-label={`阅读摘要：${title}`}>
                      <span className="reading-resource-top"><span>资料 {index + 1}</span><ArrowRightOutlined /></span>
                      <span className="reading-resource-title">{title}</span><span className="reading-resource-preview">{preview}</span>
                      <span className="reading-resource-meta"><span>{item.authorName || '作者暂未提供'}</span><span>{item.contentDate || '日期未知'}</span></span>
                    </Button>
                    <div className="reading-resource-footer">
                      {item.voteCount != null && <span className="reading-votes"><LikeOutlined /> {item.voteCount.toLocaleString()} 赞同</span>}
                      <OriginalArticleButton url={item.url} />
                    </div>
                  </ReadingCard>
                })}
              </div>}
    </section>
    {reading && <ReadingModal key={reading.resourceId} sessionId={sessionId} nodeId={node.id}
      nodeName={node.name} source={reading} onClose={() => setReading(null)} />}
  </div>
}
