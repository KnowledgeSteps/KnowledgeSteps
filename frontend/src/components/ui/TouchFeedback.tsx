import { useEffect } from 'react'
import '../../design/touch-feedback.css'

/** Touch feedback shares the existing card surfaces without intercepting clicks or scrolling. */
export function TouchFeedback() {
  useEffect(() => {
    let active: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let origin = { x: 0, y: 0, id: -1 }
    const clear = () => {
      clearTimeout(timer)
      active?.classList.remove('is-touch-active')
      active = null
    }
    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') return
      clear()
      if (!event.isPrimary || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest(':disabled, [aria-disabled="true"]')) return
      active = target?.closest<HTMLElement>('.gateway-features .uiverse-parent, .history-page .ticket-wrapper, .quiz-result-button') ?? null
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId }
      active?.classList.add('is-touch-active')
    }
    const move = (event: PointerEvent) => {
      if (event.pointerId === origin.id && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) clear()
    }
    const up = (event: PointerEvent) => {
      if (event.pointerId === origin.id) timer = setTimeout(clear, 650)
    }
    document.addEventListener('pointerdown', down, { passive: true })
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerup', up, { passive: true })
    document.addEventListener('pointercancel', clear, { passive: true })
    window.addEventListener('blur', clear)
    return () => {
      clear()
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', clear)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return null
}
