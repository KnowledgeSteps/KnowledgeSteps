import { CompassOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Pagination, Spin, Tag, Modal } from 'antd'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSessionHistory, deleteSession } from '../api/sessions'
import type { SessionHistory, SessionHistoryItem, SessionStatus } from '../api/types'
import { useAuth } from '../hooks/useAuth'
import '../design/history.css'

const statusNames: Record<SessionStatus, string> = {
  GENERATING_GRAPH: '生成图谱中', GENERATING_QUESTIONS: '准备问卷中',
  SEARCHING_RESOURCES: '整理资料中', READY: '待完成自评', COMPLETED: '已完成', FAILED: '生成失败',
}

export function SessionHistoryPage() {
  const auth = useAuth()
  return <HistoryContent key={auth.user?.userId} />
}
function HistoryContent() {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SessionHistoryItem | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [data, setData] = useState<SessionHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    getSessionHistory(page).then(result => {
      if (!cancelled) { setData(result); setError(null) }
    }).catch(() => {
      if (!cancelled) setError('历史寻路加载失败，请重试。')
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [page, reload])
  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSession(deleteTarget.sessionId)
      setDeleteTarget(null)
      setLoading(true)
      if (data?.items.length === 1 && page > 1) setPage(value => value - 1)
      setReload(value => value + 1)
    } catch {
      setDeleteError('删除失败，请刷新记录确认状态后重试。')
    } finally { setDeleting(false) }
  }
  function refresh() { setLoading(true); setError(null); setReload(value => value+1) }
  function open(item: SessionHistoryItem) {
    navigate(`/sessions/${encodeURIComponent(item.sessionId)}/${item.status === 'READY' ? 'questions' : 'result'}`)
  }
  return <div className="history-page">
    <Modal title="确认删除寻路？" open={deleteTarget !== null} okText="确认删除" cancelText="取消"
      okButtonProps={{ danger: true }} confirmLoading={deleting} cancelButtonProps={{ disabled: deleting }}
      closable={!deleting} keyboard={!deleting} maskClosable={!deleting}
      onOk={() => void confirmDelete()} onCancel={() => { if (!deleting) setDeleteTarget(null) }}>
      <p>删除“{deleteTarget?.target}”后，其图谱、问卷、答案和资料将从数据库永久删除，无法恢复。</p>
      {deleteError && <Alert type="error" title={deleteError} />}
    </Modal>
    <div className="history-heading"><div><h1>历史寻路</h1>
      <p aria-live="polite">{data ? `共 ${data.total} 次寻路` : '查看你之前的学习路径'}</p></div>
      <Button icon={<ReloadOutlined />} onClick={refresh} disabled={loading || deleting}>刷新</Button>
    </div>
    {error ? <Alert type="error" title={error} action={<Button onClick={refresh}>重试</Button>} /> :
      <Spin spinning={loading}>
        <div aria-busy={loading}>
          {!loading && data?.items.length === 0 ?
            <Empty description="还没有寻路记录"><Button type="primary" onClick={() => navigate('/')}>开始寻路</Button></Empty> :
            <div className="ticket-canvas">
              {data?.items.map(item => <article className="ticket-wrapper" key={item.sessionId} aria-label={item.target}>
                {/* Adapted from Uiverse.io by zeeshan_2112; no perforation or ticket stub. */}
                <div className="ticket"><div className="t-main">
                  <div className="t-grid" aria-hidden="true" />
                  <div className="t-content">
                    <div className="t-header"><div className="t-logo"><CompassOutlined />寻路</div><Button className="history-delete" danger disabled={loading || deleting} aria-label={`删除寻路：${item.target}`} onClick={() => { setDeleteTarget(item); setDeleteError(null) }}><span className="delete-text">删除</span><span className="delete-icon" aria-hidden="true"><DeleteOutlined /></span></Button></div>
                    
                    <h2 className="t-title">{item.target}</h2>
                    <Tag className="t-status" color={item.status === 'FAILED' ? 'error' : undefined}>{statusNames[item.status]}</Tag>
                    <p className="t-description" title={item.targetDescription || undefined}>{item.targetDescription?.trim() || (item.status === 'GENERATING_GRAPH' ? '根节点描述生成中…' : '暂无根节点描述')}</p>
                    <time className="t-date" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
                    <Button className="history-enter" data-text="进入寻路" disabled={loading || deleting} onClick={() => open(item)} aria-label={`进入寻路：${item.target}`}>
                      <span className="history-enter-text">进入寻路</span>
                    </Button>
                  </div>
                </div></div>
              </article>)}
            </div>}
          <Pagination className="history-pagination" current={page} total={data?.total ?? 0} pageSize={20}
            showSizeChanger={false} hideOnSinglePage disabled={loading || deleting} responsive
            onChange={next => { setLoading(true); setPage(next) }} />
        </div>
      </Spin>}
  </div>
}
