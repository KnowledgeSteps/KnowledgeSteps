import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Drawer, Spin } from 'antd'
import type { KnowledgeNode, NodeResources } from '../../api/types'
import { getNodeResources } from '../../api/sessions'
import { isMockMode } from '../../api/config'

interface ResourcesDrawerProps {
  sessionId: string
  node: KnowledgeNode | null
  onClose: () => void
}

export function ResourcesDrawer({
  sessionId,
  node,
  onClose,
}: ResourcesDrawerProps) {
  return (
    <Drawer
      title={node ? node.name : ''}
      placement="right"
      open={Boolean(node)}
      onClose={onClose}
      width="min(440px, 94vw)"
      className="path-drawer"
      styles={{ body: { padding: 0 } }}
    >
      {node && (
        <NodeResourcesPanel
          key={node.id}
          sessionId={sessionId}
          node={node}
        />
      )}
    </Drawer>
  )
}

function NodeResourcesPanel({
  sessionId,
  node,
}: {
  sessionId: string
  node: KnowledgeNode
}) {
  const [data, setData] = useState<NodeResources | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getNodeResources(sessionId, node.id)
      .then((payload) => {
        if (!cancelled) setData(payload)
      })
      .catch(() => {
        if (!cancelled) setError('资料加载失败，请稍后重试。')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, node.id, retryKey])

  function retry(): void {
    setData(null)
    setError(null)
    setLoading(true)
    setRetryKey((key) => key + 1)
  }

  return (
    <div className="drawer-body">
      {loading ? (
        <div className="resource-loading">
          <Spin />
          <span>正在整理这个节点的资料…</span>
        </div>
      ) : error ? (
        <StateBlock
          title="资料加载失败"
          body="暂时无法获取这个节点的学习资料，请稍后重新打开。"
          action={
            <button type="button" className="outline small" onClick={retry}>
              <ReloadOutlined /> 再试一次
            </button>
          }
        />
      ) : data?.resourceStatus === 'NOT_APPLICABLE' ? (
        <div className="explain-block">
          <span className="badge">学习目标</span>
          <p>{data.reason}</p>
          <p className="muted">
            第一版不会为目标节点搜索资料。先补齐前面的台阶，再来学它。
          </p>
        </div>
      ) : data?.resourceStatus === 'EMPTY' ? (
        <StateBlock
          title="暂时没有合适资料"
          body={
            isMockMode
              ? '这个节点还没有找到匹配的知乎内容。接入真实接口后，会在这里展示检索结果。'
              : '这个节点暂时没有找到匹配的知乎内容。'
          }
        />
      ) : data?.resourceStatus === 'FAILED' ? (
        <StateBlock
          title="资料搜索失败"
          body="搜索服务暂时不可用，已跳过这个节点，不会影响你的路径结果。"
          action={
            <button type="button" className="outline small" onClick={retry}>
              <ReloadOutlined /> 再试一次
            </button>
          }
        />
      ) : data ? (
        <>
          <div className="drawer-intro">
            <p>{data.reason}</p>
            {isMockMode && (
              <span className="muted">
                以下为本地 Mock 资料；链接为知乎站内检索，不代表具体文章。
              </span>
            )}
          </div>
          <div className="resource-list">
            {data.resources.map((item, index) => (
              <article className="resource-item" key={item.id}>
                <div className="between">
                  <span className="resource-index">资料 {index + 1}</span>
                  {isMockMode && <span className="badge demo">演示数据</span>}
                </div>
                <h4>{item.title}</h4>
                {item.summary && <p>{item.summary}</p>}
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  去知乎检索相关讨论 ↗
                </a>
                {(item.authorName || item.voteCount !== null) && (
                  <small className="resource-meta">
                    {item.authorName
                      ? `作者：${item.authorName}`
                      : '作者暂未提供'}
                    {item.voteCount !== null
                      ? ` · ${item.voteCount} 赞同`
                      : ' · 赞同数暂未提供'}
                  </small>
                )}
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

function StateBlock({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="explain-block">
      <h4>{title}</h4>
      <p>{body}</p>
      {action}
    </div>
  )
}
