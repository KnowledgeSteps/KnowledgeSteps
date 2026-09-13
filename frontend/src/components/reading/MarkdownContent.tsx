import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import '../../design/markdown.css'

export function MarkdownContent({ text }: { text: string }) {
  return <div className="reading-markdown"><Markdown skipHtml
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[[rehypeKatex, { trust: false, strict: 'error', maxExpand: 200, maxSize: 10, macros: {} }]]}
    urlTransform={url => /^https:\/\//i.test(url) ? url : ''}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span className="muted">{alt ? `［图片：${alt}］` : '［图片请查看原文］'}</span>,
      table: ({ children }) => <div className="reading-table-scroll" tabIndex={0} aria-label="内容表格，可横向滚动"><table>{children}</table></div>,
    }}>{text}</Markdown></div>
}
