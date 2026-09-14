import type { CompletionResult } from '../../api/types'
import '../../design/waiting.css'
export function ResultOverview({ result }: { result: CompletionResult }) {
  if (result.missingCount <= 0) return null
  return <section className="waiting-blob-card result-overview enter" aria-label="学习结果概览">
    <div className="waiting-blob-bg" aria-hidden="true" /><div className="waiting-blob" aria-hidden="true" />
    <div className="waiting-content"><span className="badge">基于你的自评生成的结果</span>
      <div className="between result-head"><div><h1>学习 <em>{result.target}</em>，<br />有 {result.missingCount} 个节点建议巩固或了解</h1></div>
        <div className="gap-count"><strong>{result.missingCount}</strong><span>个待巩固节点</span></div>
      </div>
    </div>
  </section>
}
