import { CollectionFilters } from '../components/reading/CollectionFilters'
import { renderContentModalCard } from '../components/ui/ContentModalCard'
import { emptyCollectionFilter, filterCollection } from '../components/reading/collectionFilter'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { App, Alert, Button, Empty, Modal, Pagination, Skeleton, Space, Tag } from 'antd'
import { BookOutlined, CheckOutlined, DeleteOutlined, ReloadOutlined, CompassOutlined } from '@ant-design/icons'
import { type Explanation } from '../api/reading'
import { useReadingServices } from '../components/reading/ReadingServices'
import { useAuth } from '../hooks/useAuth'
import { useRecoverableRead } from '../hooks/useRecoverableRead'
import { ReadingCard } from '../components/ui/ReadingCard'
import { MarkdownContent } from '../components/reading/MarkdownContent'
import '../design/doubts.css'
import '../design/history.css'

export function DoubtsPage({ onReturn }: { onReturn?: () => void } = {}) {
  const auth = useAuth()
  return <DoubtsContent key={auth.user?.userId} onReturn={onReturn} />
}
function DoubtsContent({ onReturn }: { onReturn?: () => void }) {
  const { getAllDoubts, updateDoubt, deleteDoubt } = useReadingServices()
  const { message } = App.useApp()
  const routerNavigate = useNavigate()
  const navigate = (path: string) => onReturn ? onReturn() : routerNavigate(path)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(emptyCollectionFilter)
  const [selected, setSelected] = useState<Explanation | null>(null)
  const [removing, setRemoving] = useState<Explanation | null>(null)
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const { data, error, retrying, reload } = useRecoverableRead('collection', getAllDoubts)
  const filtered = filterCollection(data?.items ?? [], filter)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)))
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20)

  async function changeStatus(item: Explanation) {
    if (busy) return
    setBusy(true); setMutationError(null)
    try {
      const updated = await updateDoubt(item.id, !item.understood)
      setSelected(current => current?.id === updated.id ? updated : current)
      reload()
    } catch (e) { setMutationError(e instanceof Error ? e.message : '暂时无法更新，请重试。') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!removing || busy) return
    setBusy(true); setMutationError(null)
    try {
      await deleteDoubt(removing.id)
      if (selected?.id === removing.id) setSelected(null)
      setRemoving(null)
      reload()
      void message.success('已删除这条疑惑')
    } catch (e) { setMutationError(e instanceof Error ? e.message : '删除失败，请重试。') }
    finally { setBusy(false) }
  }
  return <section className="doubts-page history-page">
    <ReadingCard className="doubts-intro">
      <div className="doubts-heading"><div><Tag icon={<BookOutlined />}>把暂时不懂的，留给下一次理解</Tag>
        <h1>疑惑本</h1><p>保存阅读中卡住的句子，带着解释回来再看。</p></div>
        <div className="gap-count"><strong>{data?.total ?? '—'}</strong><span>条已保存的疑惑</span></div></div>
    </ReadingCard>
    <div className="doubts-toolbar"><span className="muted">记录随账号保存；删除原寻路时，关联疑惑也会删除。</span><Button icon={<ReloadOutlined />} onClick={reload} disabled={retrying}>刷新</Button></div>
    {error && <Alert type="error" showIcon title="疑惑本暂时无法读取" description={error.message} action={<Button onClick={reload}>重试</Button>} />}
    {mutationError && !removing && <Alert type="error" showIcon title={mutationError} />}
    {!data && !error && <ReadingCard><Skeleton active paragraph={{ rows: 4 }} /></ReadingCard>}
    {data?.total === 0 && <ReadingCard><Empty description="还没有保存的疑惑"><p>打开寻路中的资料，选中不懂的句子，查看解释后保存到这里。</p><Button type="primary" onClick={() => navigate('/history')}>从历史寻路开始阅读</Button></Empty></ReadingCard>}
    <CollectionFilters items={data?.items ?? []} value={filter} disabled={!data || busy} count={filtered.length} onChange={next => { setFilter(next); setPage(1) }} />
    {data && data.total > 0 && filtered.length === 0 && <Empty description="没有符合条件的记录" />} 
    <div className="ticket-canvas">{visible.map(item => <article key={item.id} className="ticket-wrapper doubt-ticket" aria-label={item.nodeName}>
      <div className="ticket"><div className="t-main"><div className="t-grid" aria-hidden="true" /><div className="t-content">
        <div className="t-header"><div className="t-logo"><CompassOutlined /><span title={item.sessionTarget}>{item.sessionTarget || '所属寻路'}</span></div>
          <Button className="history-delete" danger aria-label={`删除疑惑：${item.quote}`} disabled={busy} onClick={() => { setMutationError(null); setRemoving(item) }}><span className="delete-text">删除</span><span className="delete-icon" aria-hidden="true"><DeleteOutlined /></span></Button></div>
        <h2 className="t-title">{item.nodeName}</h2>
        <Tag className="t-status" color={item.understood ? 'blue' : undefined}>{item.understood ? '已理解' : '待理解'}</Tag>
        <p className="t-description" title={`你的疑惑：${item.quote}`}><span className="doubt-quote-label">你的疑惑：</span>{item.quote}</p>
        <time className="t-date" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</time>
        <Button className="history-enter" data-text="查看理解" aria-label="查看理解" onClick={() => { setMutationError(null); setSelected(item) }}><span className="history-enter-text">查看理解</span></Button>
      </div></div></div>
    </article>)}</div>
    {data && filtered.length > 20 && <Pagination current={currentPage} total={filtered.length} pageSize={20} showSizeChanger={false} onChange={setPage} />}
    <Modal open={!!selected} title="回看这条疑惑" onCancel={() => !busy && setSelected(null)} width={840} footer={null} className="doubt-detail-modal" modalRender={renderContentModalCard}>
      {mutationError && <Alert type="error" showIcon title={mutationError} />}
      {selected && <><header className="doubt-detail-heading">
        <p>所属寻路：{selected.sessionTarget || '所属寻路'}</p>
        <h2>{selected.nodeName}</h2>
        <div className="between"><Space wrap>
          <Button icon={<CheckOutlined />} loading={busy} onClick={() => void changeStatus(selected)}>{selected.understood ? '改为待理解' : '标记已理解'}</Button>
          <Button onClick={() => onReturn ? onReturn() : navigate(`/sessions/${selected.sessionId}/result`)}>回到这次寻路</Button>
        </Space><time dateTime={selected.createdAt}>{new Date(selected.createdAt).toLocaleDateString('zh-CN')}</time></div>
      </header>
        <blockquote className="doubt-quote">{selected.quote}</blockquote><MarkdownContent text={selected.explanationMarkdown} />
        <Space wrap>
          {selected.sourceUrl && <Button href={selected.sourceUrl} target="_blank" rel="noopener noreferrer">在知乎阅读原文</Button>}
        </Space></>}
    </Modal>
    <Modal open={!!removing} title="删除这条疑惑？" okText="确认删除" cancelText="取消" okButtonProps={{ danger: true }} confirmLoading={busy} closable={!busy} maskClosable={!busy} keyboard={!busy} cancelButtonProps={{ disabled: busy }} onCancel={() => { if (!busy) { setRemoving(null); setMutationError(null) } }} onOk={() => void remove()}>
      <p>删除后无法恢复，原寻路和资料会保留。</p>{mutationError && <Alert type="error" title={mutationError} />}
    </Modal>
  </section>
}
