import katex from 'katex'
import 'katex/dist/katex.min.css'
import { resourceMathExcerpt } from './resourceMath'

export function ResourceSummary({ text }: { text: string }) {
  return <p className="resource-summary">{resourceMathExcerpt(text).map((part, index) => {
    if (!part.math) return <span key={index}>{part.text}</span>
    try {
      const html = katex.renderToString(part.text, {
        throwOnError: true, trust: false, strict: 'error',
        maxExpand: 200, maxSize: 10, macros: {},
      })
      // Only KaTeX-generated markup is inserted; source prose stays React-escaped.
      return <span className="resource-math" key={index} dangerouslySetInnerHTML={{ __html: html }} />
    } catch {
      return <span key={index}>（公式请查看原文）</span>
    }
  })}</p>
}
