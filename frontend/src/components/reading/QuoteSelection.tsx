import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BulbOutlined } from '@ant-design/icons'
import { Button } from 'antd'

interface SelectedQuote { quote: string; context: string; x: number; y: number }

/** Selection is accepted only when both ends belong to this reading surface. */
export function QuoteSelection({ children, onExplain }: {
  children: ReactNode
  onExplain: (quote: string, context: string) => void
}) {
  const surface = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<SelectedQuote | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    function inspect() {
      const selection = window.getSelection()
      const root = surface.current
      if (!root || !selection || selection.isCollapsed || !selection.rangeCount
        || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) { setSelected(null); return }
      const quote = selection.toString().trim()
      if (!quote || Array.from(quote).length > 1000) { setSelected(null); return }
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      const text = root.innerText
      const index = text.indexOf(quote)
      const context = index >= 0 ? text.slice(Math.max(0, index - 450), index + quote.length + 450).slice(0, 2000) : quote.slice(0, 2000)
      setSelected({ quote, context, x: Math.min(window.innerWidth - 90, Math.max(90, rect.left + rect.width / 2)),
        y: Math.max(60, Math.min(window.innerHeight - 60, rect.top - 6)) })
    }
    function schedule() { clearTimeout(timer); timer = setTimeout(inspect, 180) }
    function hide() { clearTimeout(timer); setSelected(null) }
    function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') hide(); else schedule() }
    document.addEventListener('selectionchange', schedule)
    document.addEventListener('pointerup', schedule)
    document.addEventListener('keyup', keyboard)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', schedule)
      document.removeEventListener('pointerup', schedule)
      document.removeEventListener('keyup', keyboard)
      window.removeEventListener('scroll', hide, true)
      window.removeEventListener('resize', hide)
    }
  }, [])
  return <>
    <div ref={surface} className="reading-selectable">{children}</div>
    {selected && createPortal(<div className="reading-selection-actions" role="toolbar" aria-label="选中文字的操作"
      style={{ left: selected.x, top: selected.y }}><Button type="text" className="reading-selection-button"
      icon={<span className="reading-selection-bulb" aria-hidden="true"><BulbOutlined /></span>}
      onMouseDown={event => event.preventDefault()} onClick={() => {
        onExplain(selected.quote, selected.context); setSelected(null); window.getSelection()?.removeAllRanges()
      }}>这段看不懂？</Button></div>, document.body)}
  </>
}
