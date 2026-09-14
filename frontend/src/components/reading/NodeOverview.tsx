import { useEffect, useRef, useState } from 'react'
import { BulbOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Spin } from 'antd'
import { useReadingServices } from './ReadingServices'
import { FavoriteCardButton } from './FavoriteCardButton'
import { ApiError } from '../../api/types'
import type { KnowledgeNode } from '../../api/types'
import { ReadingCard } from '../ui/ReadingCard'
import { MarkdownContent } from './MarkdownContent'
import { QuoteSelection } from './QuoteSelection'
import { ReadingModal } from './ReadingModal'

export function NodeOverview({ sessionId, node }: { sessionId: string; node: KnowledgeNode }) {
  const { getNodeOverview, removeKnowledgeCard, saveKnowledgeCard, demo } = useReadingServices()
  const [content, setContent] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const active = useRef(false)
  const savingLock = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryKey, setRetryKey] = useState(0)
  const [quote, setQuote] = useState<{ quote: string; context: string } | null>(null)
  useEffect(() => {
    active.current = true
    const abort = new AbortController()
    getNodeOverview(sessionId, node.id, abort.signal)
      .then(result => { if (!abort.signal.aborted) { setContent(result.contentMarkdown); setSaved(result.saved) } })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof ApiError ? reason.message : '讲解生成暂时失败，请重试。') })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => { active.current = false; abort.abort() }
  }, [sessionId, node.id, retryKey, getNodeOverview])
  async function favorite() {
    if (savingLock.current || !content) return
    savingLock.current = true; setSaving(true); setSaveError(null)
    try {
      if (saved) {
        await removeKnowledgeCard(node.id)
        if (active.current) setSaved(false)
      } else {
        const result = await saveKnowledgeCard(sessionId, node.id)
        if (active.current) setSaved(result.saved)
      }
    }
    catch (e) { if (active.current) setSaveError(e instanceof Error ? e.message : saved ? '取消收藏失败，请重试。' : '收藏失败，请重试。') }
    finally { savingLock.current = false; if (active.current) setSaving(false) }
  }
  return <ReadingCard className="reading-overview">
    <div className="reading-section-heading reading-overview-heading"><h3>知识点卡片</h3>
      <FavoriteCardButton saved={saved} loading={saving} disabled={loading || !content} onClick={() => void favorite()} /></div>
    {saveError && <p className="reading-error" role="alert">{saveError}</p>}
    {loading ? <div className="reading-loading" role="status"><Spin /><span>正在整理通俗讲解，生成后会自动保存…</span></div>
      : error ? <div className="reading-state"><p role="alert">{error}</p><Button icon={<ReloadOutlined />} onClick={() => {
        setError(null); setLoading(true); setRetryKey(value => value + 1)
      }}>重新生成</Button></div>
        : content ? <><QuoteSelection onExplain={(selected, context) => setQuote({ quote: selected, context })}>
          <MarkdownContent text={content} />
        </QuoteSelection><div className="reading-overview-footer"><span>{demo ? '教程示例' : 'AI 生成'} · 在文章中使用鼠标选中不理解的句子，我为你解释。</span>
          <Button type="text" icon={<BulbOutlined />} onClick={() => setQuote({ quote: '', context: '' })}>解释一句话</Button></div>
        </> : null}
    {quote && content && <ReadingModal sessionId={sessionId} nodeId={node.id} nodeName={node.name}
      source={{ kind: 'overview', title: `${node.name} · 知识点卡片`, text: content }} initialQuote={quote}
      onClose={() => setQuote(null)} />}
  </ReadingCard>
}
