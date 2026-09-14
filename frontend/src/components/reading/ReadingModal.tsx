import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeftOutlined, BookOutlined, BulbOutlined, CheckOutlined, LikeOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Modal, Spin, Tag, Typography } from 'antd'
import { useReadingServices } from './ReadingServices'
import type { Explanation } from '../../api/reading'
import { ApiError } from '../../api/types'
import { ReadingCard } from '../ui/ReadingCard'
import { MarkdownContent } from './MarkdownContent'
import { QuoteSelection } from './QuoteSelection'
import { OriginalArticleButton } from './OriginalArticleButton'

export interface ReadingSource {
  kind: 'summary' | 'overview'
  resourceId?: string
  title: string
  text: string
  sourceUrl?: string
  authorName?: string | null
  authorUrl?: string | null
  voteCount?: number | null
  contentDate?: string | null
}

export function ReadingModal({ sessionId, nodeId, nodeName, source, initialQuote, onClose }: {
  sessionId: string; nodeId: string; nodeName: string; source: ReadingSource
  initialQuote?: { quote: string; context: string }
  onClose: () => void
}) {
  const { explainQuote, saveDoubt, demo } = useReadingServices()
  const [view, setView] = useState<'reader' | 'explanation'>(initialQuote ? 'explanation' : 'reader')
  const [quote, setQuote] = useState(initialQuote?.quote ?? '')
  const [context, setContext] = useState(initialQuote?.context ?? '')
  const [explanation, setExplanation] = useState<Explanation | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const active = useRef(true)
  const request = useRef<AbortController | null>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const explanationHeading = useRef<HTMLHeadingElement>(null)
  const readerScroll = useRef(0)
  const editGeneration = useRef(0)

  useEffect(() => {
    active.current = true
    return () => { active.current = false; request.current?.abort(); editGeneration.current += 1 }
  }, [])
  useLayoutEffect(() => {
    if (scrollArea.current) scrollArea.current.scrollTop = view === 'reader' ? readerScroll.current : 0
    if (view === 'explanation') explanationHeading.current?.focus({ preventScroll: true })
  }, [view])

  function openExplanation(selected = '', surrounding = '') {
    readerScroll.current = scrollArea.current?.scrollTop ?? 0
    request.current?.abort()
    editGeneration.current += 1
    setQuote(selected); setContext(surrounding); setExplanation(null); setError(null); setSaveError(null)
    setLoading(false); setSaving(false); setView('explanation')
  }
  function returnToReading() {
    request.current?.abort(); editGeneration.current += 1; setLoading(false); setView('reader')
  }
  async function explain() {
    if (loading || !quote.trim() || Array.from(quote).length > 1000) return
    request.current?.abort()
    const abort = new AbortController()
    request.current = abort
    const generation = ++editGeneration.current
    setLoading(true); setError(null); setExplanation(null); setSaveError(null)
    try {
      const result = await explainQuote(sessionId, nodeId, {
        ...(source.resourceId ? { resourceId: source.resourceId } : {}),
        quote: quote.trim(), ...(context ? { context } : {}),
      }, abort.signal)
      if (active.current && !abort.signal.aborted && generation === editGeneration.current) setExplanation(result)
    } catch (reason) {
      if (active.current && !abort.signal.aborted && generation === editGeneration.current)
        setError(reason instanceof ApiError ? reason.message : '解释暂时失败，请重试。')
    } finally {
      if (active.current && !abort.signal.aborted && generation === editGeneration.current) setLoading(false)
    }
  }
  async function save() {
    if (!explanation || saving || explanation.saved) return
    const id = explanation.id
    const generation = editGeneration.current
    setSaving(true); setSaveError(null)
    try {
      const result = await saveDoubt(id)
      if (active.current && generation === editGeneration.current) setExplanation(result)
    } catch (reason) {
      if (active.current && generation === editGeneration.current)
        setSaveError(reason instanceof ApiError ? reason.message : '保存失败，请重试。')
    } finally {
      if (active.current && generation === editGeneration.current) setSaving(false)
    }
  }

  const tooLong = Array.from(quote).length > 1000
  const authorUrl = source.authorUrl && /^https:\/\/(?:www\.)?zhihu\.com\/(?:people|org)\/[a-zA-Z0-9_-]+\/?$/.test(source.authorUrl) ? source.authorUrl : null

  return <Modal open onCancel={onClose} footer={null} width={820} className="reading-modal" destroyOnHidden
    title={view === 'reader' ? '阅读资料' : '这段话怎么理解'}>
    <div className="reading-modal-scroll" ref={scrollArea}>
      {view === 'reader' ? <>
        <div className="reading-source-heading">{source.kind === 'overview' && <Tag>{demo ? '教程示例讲解' : 'AI 讲解'}</Tag>}
          <h2>{source.title}</h2>
          <div className="reading-source-meta"><span>{authorUrl && source.authorName
            ? <Typography.Link href={authorUrl} target="_blank" rel="noopener noreferrer">{source.authorName}</Typography.Link>
            : source.authorName || (source.kind === 'overview' ? '知阶 AI' : '作者暂未提供')}</span>
            {source.contentDate && <span className="reading-source-date">发布／更新：<time dateTime={source.contentDate}>{source.contentDate}</time></span>}</div>
          {source.voteCount != null && <div className="reading-votes"><LikeOutlined /> {source.voteCount.toLocaleString()} 赞同</div>}
          <OriginalArticleButton url={source.sourceUrl} />
        </div>
        <div className="reading-prose">
          {source.text ? <QuoteSelection onExplain={openExplanation}><MarkdownContent text={source.text} /></QuoteSelection>
            : <p className="reading-muted">这篇资料暂未提供摘要，请前往知乎阅读原文。</p>}
        </div>
      </> : <>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={returnToReading} className="reading-back">返回阅读</Button>
        <h3 className="reading-explanation-title" ref={explanationHeading} tabIndex={-1}>理解这段话</h3>
        <p className="reading-muted">结合「{nodeName}」解释原句，也可以修改选中的内容。</p>
        <label htmlFor="reading-quote-input" className="reading-input-label">不理解的句子</label>
        <Input.TextArea id="reading-quote-input" value={quote} autoSize={{ minRows: 3, maxRows: 7 }}
          placeholder="粘贴你不理解的一句话，最多 1000 字。" disabled={loading || saving}
          status={tooLong ? 'error' : undefined} onChange={event => {
            setQuote(event.target.value); setContext(''); setExplanation(null); setError(null); setSaveError(null)
          }} />
        <div className="reading-explain-controls"><span className={tooLong ? 'reading-error' : 'reading-muted'}>
          {Array.from(quote).length} / 1000 字</span>
          <Button type="primary" icon={<BulbOutlined />} loading={loading} disabled={!quote.trim() || tooLong || saving} onClick={() => void explain()}>
            {error ? '重新解释' : '解释这段话'}
          </Button></div>
        {error && <Alert type="error" showIcon title={error} />}
        {loading && <div className="reading-loading" role="status"><Spin /><span>正在结合知识点解释这段话…</span></div>}
        {explanation && <ReadingCard className="reading-explanation-card">
          <div className="reading-section-heading"><h3>通俗解释</h3><Tag icon={<BulbOutlined />}>{demo ? '教程示例' : 'AI 生成'}</Tag></div>
          <MarkdownContent text={explanation.explanationMarkdown} />
          <p className="reading-help">{demo ? '本段为预先准备的示例解释，不调用 AI。' : 'AI 解释用于辅助理解，可结合原文核对。'}</p>
          <Button icon={explanation.saved ? <CheckOutlined /> : <BookOutlined />} loading={saving}
            disabled={explanation.saved} onClick={() => void save()}>{explanation.saved ? '已保存到疑惑本' : '保存到疑惑本'}</Button>
          {explanation.saved && <span role="status" className="reading-saved-note">可从导航栏的疑惑本再次查看。</span>}
          {saveError && <p role="alert" className="reading-error">{saveError}</p>}
        </ReadingCard>}
      </>}
    </div>
  </Modal>
}
