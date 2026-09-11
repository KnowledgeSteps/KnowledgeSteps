import type { HTMLAttributes, ReactNode } from 'react'
import { CardDecoration } from './CardDecoration'

// Original supplied HTML: parent > card > (logo, glass, content).
export function KnowledgeCard({ icon, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { icon: ReactNode }) {
  return <div className="uiverse-parent">
    <div {...props} className={`uiverse-card ${className}`}>
      <CardDecoration icon={icon} />
      <div className="uiverse-content">{children}</div>
    </div>
  </div>
}
