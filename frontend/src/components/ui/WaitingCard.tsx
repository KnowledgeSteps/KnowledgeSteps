import type { HTMLAttributes } from 'react'
import '../../design/waiting.css'

/** Original WaitingView card structure; all consumers share its existing CSS and animation. */
export function WaitingCard({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`waiting-blob-card ${className}`}>
    <div className="waiting-blob-bg" aria-hidden="true" />
    <div className="waiting-blob" aria-hidden="true" />
    <div className="waiting-content">{children}</div>
  </div>
}
