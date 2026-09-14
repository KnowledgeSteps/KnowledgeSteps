import type { ReactNode } from 'react'
import { WaitingCard } from './WaitingCard'
import '../../design/content-modal.css'

/** Keep Ant Design's dialog semantics and controls inside the shared card surface. */
export function renderContentModalCard(node: ReactNode) {
  return <WaitingCard className="content-modal-card">{node}</WaitingCard>
}
