import type { HTMLAttributes } from 'react'
import { WaitingCard } from './WaitingCard'
import '../../design/reading-card.css'

/** Reuse the actual path-generation card, without a separate visual treatment. */
export function ReadingCard({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <WaitingCard {...props} className={`reading-card ${className}`}>{children}</WaitingCard>
}
