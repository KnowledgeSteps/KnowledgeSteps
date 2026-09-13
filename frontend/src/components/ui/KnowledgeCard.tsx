import type { HTMLAttributes, ReactNode } from 'react'
import { ReadingCard } from './ReadingCard'

// Latest user-selected default: the same surface as the result overview.
export function KnowledgeCard({ icon, children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { icon: ReactNode }) {
  return <ReadingCard {...props} className={className}>
    <span className="reading-card-icon" aria-hidden="true">{icon}</span>
    {children}
  </ReadingCard>
}
