import { CollectionFilters } from '../components/reading/CollectionFilters'
import { renderContentModalCard } from '../components/ui/ContentModalCard'
import { emptyCollectionFilter, filterCollection } from '../components/reading/collectionFilter'
import { useState } from 'react'
import { Alert, Button, Empty, Modal, Pagination, Skeleton, Tag } from 'antd'
import { BookOutlined, DeleteOutlined, ReloadOutlined, CompassOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { type KnowledgeCardItem } from '../api/reading'
import { useReadingServices } from '../components/reading/ReadingServices'
import { useAuth } from '../hooks/useAuth'
import { useRecoverableRead } from '../hooks/useRecoverableRead'
import { ReadingCard } from '../components/ui/ReadingCard'
import { MarkdownContent } from '../components/reading/MarkdownContent'
import '../design/history.css'
import '../design/doubts.css'
import '../design/knowledge-cards.css'

interface CardsPageProps { onReturn?: () => void; onCardOpened?: () => void }
export function KnowledgeCardsPage({ onReturn, onCardOpened }: CardsPageProps = {}) {
  const auth = useAuth()
  return <CardsContent key={auth.user?.userId} onReturn={onReturn} onCardOpened={onCardOpened} />
}
function CardsContent({ onReturn, onCardOpened }: CardsPageProps) {
  const { getAllKnowledgeCards, removeKnowledgeCard, markKnowledgeCard } = useReadingServices()
  const routerNavigate = useNavigate()
  const navigate = (path: string) => onReturn ? onReturn() : routerNavigate(path)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(emptyCollectionFilter)
  const [selected, setSelected] = useState<KnowledgeCardItem | null>(null)
  const [removing, setRemoving] = useState<KnowledgeCardItem | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const { data, error, retrying, reload } = useRecoverableRead('collection', getAllKnowledgeCards)
  const filtered = filterCollection(data?.items ?? [], filter)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 20)))
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20)
  async function changeStatus(item: KnowledgeCardItem) {
    if (busy) return
    setBusy(true); setFailure(null)
    try {
      await markKnowledgeCard(item.nodeId, !item.understood)
      setSelected(current => current?.nodeId === item.nodeId ? { ...current, understood: !item.understood } : current)
      reload()
    } catch (e) { setFailure(e instanceof Error ? e.message : '状态更新失败，请重试。') }
    finally { setBusy(false) }
  }
  async function remove() {
    if (!removing || busy) return
    setBusy(true); setFailure(null)
    try {
      await removeKnowledgeCard(removing.nodeId)
      if (selected?.nodeId === removing.nodeId) setSelected(null)
      setRemoving(null)
      reload()
    } catch (e) { setFailure(e instanceof Error ? e.message : '取消收藏失败，请重试。') }
    finally { setBusy(false) }
  }
  return <section className="doubts-page knowledge-cards-page history-page">
    <ReadingCard><div className="doubts-heading"><div><Tag icon={<BookOutlined />}>把值得记住的，留给下一次回看</Tag><h1>知识卡片</h1><p>把值得回看的知识，收藏在这里。</p></div>
      <div className="gap-count"><strong>{data?.total ?? '—'}</strong><span>张已收藏卡片</span></div></div></ReadingCard>
    <div className="doubts-toolbar"><span className="muted">收藏随账号保存；删除原寻路时，关联卡片也会删除。</span><Button icon={<ReloadOutlined />} disabled={retrying} onClick={reload}>刷新</Button></div>
    {error && <Alert type="error" showIcon title="知识卡片暂时无法读取" description={error.message} action={<Button onClick={reload}>重试</Button>} />}
    {!data && !error && <ReadingCard><Skeleton active /></ReadingCard>}
    {data?.total === 0 && <ReadingCard><Empty description="还没有收藏知识卡片"><p>打开寻路中的知识点，点击“收藏卡片”。</p><Button type="primary" onClick={() => navigate('/history')}>前往历史寻路</Button></Empty></ReadingCard>}
    <CollectionFilters items={data?.items ?? []} value={filter} disabled={!data || busy} count={filtered.length} onChange={next => { setFilter(next); setPage(1) }} />
    {data && data.total > 0 && filtered.length === 0 && <Empty description="没有符合条件的记录" />} 
    <div className="ticket-canvas">{visible.map(item => <article key={item.nodeId} className="ticket-wrapper doubt-ticket" aria-label={item.nodeName}>
      <div className="ticket"><div className="t-main"><div className="t-grid" aria-hidden="true" /><div className="t-content">
        <div className="t-header"><div className="t-logo"><CompassOutlined /><span title={item.sessionTarget}>{item.sessionTarget || '所属寻路'}</span></div>
          <Button className="history-delete" danger disabled={busy} aria-label={`取消收藏：${item.nodeName}`} onClick={() => { setFailure(null); setRemoving(item) }}><span className="delete-text">取消</span><span className="delete-icon" aria-hidden="true"><DeleteOutlined /></span></Button></div>
        <h2 className="t-title">{item.nodeName}</h2><Tag className="t-status" color={item.understood ? 'blue' : undefined}>{item.understood ? '已理解' : '待理解'}</Tag><Tag color="blue">熟练度：{familiarityName(item.familiarity)}</Tag>
        <p className="t-description" title={item.description}>{item.description}</p>
        <time className="t-date" dateTime={item.savedAt}>{new Date(item.savedAt).toLocaleDateString('zh-CN')}</time>
        <Button className="history-enter" data-text="查看卡片" aria-label="查看卡片" onClick={() => { setSelected(item); onCardOpened?.() }}><span className="history-enter-text">查看卡片</span></Button>
      </div></div></div>
    </article>)}</div>
    {data && filtered.length > 20 && <Pagination current={currentPage} total={filtered.length} pageSize={20} showSizeChanger={false} onChange={setPage} />}
    <Modal open={!!selected} title="查看知识卡片" width={840} footer={null} className="doubt-detail-modal" onCancel={() => !busy && setSelected(null)} modalRender={renderContentModalCard}>
      {failure && !removing && <Alert type="error" title={failure} />}
      {selected && <><header className="doubt-detail-heading"><p>所属寻路：{selected.sessionTarget || '所属寻路'}</p><h2>{selected.nodeName}</h2><Tag color="blue">熟练度：{familiarityName(selected.familiarity)}</Tag>
        <div className="between"><div className="knowledge-detail-actions"><Button loading={busy} onClick={() => void changeStatus(selected)}>{selected.understood ? '改为待理解' : '标记已理解'}</Button><Button disabled={busy} onClick={() => { setFailure(null); setRemoving(selected) }}>取消收藏</Button><Button onClick={() => navigate(`/sessions/${selected.sessionId}/result`)}>回到这次寻路</Button></div><time dateTime={selected.savedAt}>{new Date(selected.savedAt).toLocaleDateString('zh-CN')}</time></div>
      </header><MarkdownContent text={selected.contentMarkdown} /></>}
    </Modal>
    <Modal open={!!removing} title="取消收藏这张卡片？" okText="取消收藏" cancelText="保留" confirmLoading={busy} closable={!busy} keyboard={!busy} maskClosable={!busy} cancelButtonProps={{ disabled: busy }} onOk={() => void remove()} onCancel={() => !busy && setRemoving(null)}>
      <p>原寻路及知识点讲解会保留，以后可以重新收藏。</p>{failure && <Alert type="error" title={failure} />}
    </Modal>
  </section>
}
function familiarityName(value?: string) {
  return ({ VERY_FAMILIAR: '非常了解', BASICALLY_KNOW: '基本了解', HEARD_OF: '听说过', DONT_KNOW: '不了解', TARGET: '学习目标' } as Record<string, string>)[value ?? ''] ?? '未自评'
}
