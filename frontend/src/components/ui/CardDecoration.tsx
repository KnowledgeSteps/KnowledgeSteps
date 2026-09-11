import type { ReactNode } from 'react'

// From Uiverse.io by Smit-Prajapati: original logo/circle1–5 and glass structure.
// Spans keep the same structure valid inside clickable Ant Design buttons.
export function CardDecoration({ icon }: { icon: ReactNode }) {
  return <>
    <span className="uiverse-logo" aria-hidden="true">
      <span className="uiverse-circle circle1" />
      <span className="uiverse-circle circle2" />
      <span className="uiverse-circle circle3" />
      <span className="uiverse-circle circle4" />
      <span className="uiverse-circle circle5">{icon}</span>
    </span>
    <span className="uiverse-glass" aria-hidden="true" />
  </>
}
