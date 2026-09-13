import { FullscreenOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { constrainGraph, fitGraph, MAX_GRAPH_SCALE, zoomGraph, type GraphPoint, type GraphSize, type GraphTransform } from './graphTransform'
import '../../design/graph-viewport.css'

const identity: GraphTransform = { x: 0, y: 0, scale: 1 }
const midpoint = (a: GraphPoint, b: GraphPoint): GraphPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: GraphPoint, b: GraphPoint) => Math.hypot(a.x - b.x, a.y - b.y)

export function GraphViewport({ children, width }: { children: ReactNode; width: number }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const state = useRef({ mobile: false, fitted: true, content: { width: 1, height: 1 } as GraphSize,
    viewport: { width: 1, height: 1 } as GraphSize, view: identity, fit: identity })
  const pointers = useRef(new Map<number, GraphPoint>())
  const gesture = useRef<{ points: GraphPoint[]; view: GraphTransform } | null>(null)
  const suppressClick = useRef(false)
  const [display, setDisplay] = useState({ mobile: false, ready: false, view: identity, minScale: 1 })

  function apply(view: GraphTransform, fitted = false) {
    const current = state.current
    current.view = constrainGraph(view, current.content, current.viewport)
    current.fitted = fitted || (Math.abs(current.view.scale - current.fit.scale) < 0.000001
      && Math.abs(current.view.x - current.fit.x) < 0.5 && Math.abs(current.view.y - current.fit.y) < 0.5)
    setDisplay({ mobile: current.mobile, ready: true, view: current.view, minScale: current.fit.scale })
  }

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const query = window.matchMedia('(max-width: 760px)')
    const measure = () => {
      const current = state.current
      const mobile = query.matches
      const nextContent = { width: content.offsetWidth, height: content.offsetHeight }
      const nextViewport = { width: viewport.clientWidth, height: viewport.clientHeight }
      if (!nextContent.width || !nextContent.height || !nextViewport.width || !nextViewport.height) return
      const changedMode = mobile !== current.mobile
      const oldViewport = current.viewport
      current.mobile = mobile
      current.content = nextContent
      current.viewport = nextViewport
      current.fit = fitGraph(nextContent, nextViewport)
      if (changedMode) {
        pointers.current.clear()
        gesture.current = null
        viewport.scrollLeft = 0
      }
      if (!mobile) {
        current.fitted = true
        current.view = identity
      } else if (changedMode || current.fitted) {
        current.fitted = true
        current.view = current.fit
      } else {
        // Resizing or late-loading descriptions must not undo a user's zoom.
        const scale = Math.min(MAX_GRAPH_SCALE, Math.max(current.fit.scale, current.view.scale))
        current.view = constrainGraph(zoomGraph(current.view, scale,
          { x: oldViewport.width / 2, y: oldViewport.height / 2 },
          { x: nextViewport.width / 2, y: nextViewport.height / 2 }), nextContent, nextViewport)
      }
      setDisplay({ mobile, ready: true, view: current.view, minScale: current.fit.scale })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(content)
    query.addEventListener('change', measure)
    return () => { observer.disconnect(); query.removeEventListener('change', measure) }
  }, [])

  function localPoint(event: PointerEvent<HTMLDivElement>): GraphPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  function rebaseGesture() {
    gesture.current = pointers.current.size ? { points: [...pointers.current.values()].slice(0, 2), view: state.current.view } : null
  }
  function capturePointers() {
    for (const id of pointers.current.keys()) viewportRef.current?.setPointerCapture(id)
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!state.current.mobile || (event.pointerType === 'mouse' && event.button !== 0)) return
    if (!pointers.current.size) suppressClick.current = false
    pointers.current.set(event.pointerId, localPoint(event))
    if (pointers.current.size > 1) {
      suppressClick.current = true
      capturePointers()
    }
    rebaseGesture()
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return
    pointers.current.set(event.pointerId, localPoint(event))
    const points = [...pointers.current.values()].slice(0, 2)
    const start = gesture.current
    if (points.length > 1 && start.points.length > 1) {
      const current = state.current
      const scale = Math.min(MAX_GRAPH_SCALE, Math.max(current.fit.scale,
        start.view.scale * distance(points[0], points[1]) / Math.max(1, distance(start.points[0], start.points[1]))))
      apply(zoomGraph(start.view, scale, midpoint(start.points[0], start.points[1]), midpoint(points[0], points[1])))
    } else {
      if (!suppressClick.current && distance(points[0], start.points[0]) < 6) return
      suppressClick.current = true
      capturePointers()
      apply({ ...start.view, x: start.view.x + points[0].x - start.points[0].x, y: start.view.y + points[0].y - start.points[0].y })
    }
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    rebaseGesture()
  }
  function reset() {
    apply(state.current.fit, true)
  }
  function zoom(factor: number) {
    const current = state.current
    const scale = Math.min(MAX_GRAPH_SCALE, Math.max(current.fit.scale, current.view.scale * factor))
    apply(zoomGraph(current.view, scale, { x: current.viewport.width / 2, y: current.viewport.height / 2 }), scale === current.fit.scale)
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!state.current.mobile || event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === '+' || event.key === '=') zoom(1.25)
    else if (event.key === '-') zoom(0.8)
    else if (event.key === '0' || event.key === 'Home') reset()
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const view = state.current.view
      apply({ ...view, x: view.x + (event.key === 'ArrowLeft' ? 60 : event.key === 'ArrowRight' ? -60 : 0),
        y: view.y + (event.key === 'ArrowUp' ? 60 : event.key === 'ArrowDown' ? -60 : 0) })
    } else return
    event.preventDefault()
  }

  return <>
    <div className="graph-mobile-toolbar" role="group" aria-label="图谱缩放控制">
      <span className="graph-gesture-hint">双指缩放 · 单指拖动</span>
      <div className="graph-zoom-actions">
        <Button icon={<MinusOutlined />} aria-label="缩小图谱" disabled={!display.ready || display.view.scale <= display.minScale + 0.001} onClick={() => zoom(0.8)} />
        <Button icon={<PlusOutlined />} aria-label="放大图谱" disabled={!display.ready || display.view.scale >= MAX_GRAPH_SCALE} onClick={() => zoom(1.25)} />
        <Button icon={<FullscreenOutlined />} disabled={!display.ready} onClick={reset}>显示全图</Button>
      </div>
    </div>
    <div ref={viewportRef} className={`path-scroll graph-viewport${display.ready ? ' is-ready' : ''}`} tabIndex={0} role="region"
      aria-label={display.mobile ? '知识图谱，可双指缩放、单指拖动，键盘加减号缩放，方向键移动，0显示全图' : '知识图谱，可横向滚动'}
      style={{ '--graph-width': `${width}px` } as CSSProperties}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onKeyDown={keyDown} onClickCapture={event => {
        // A drag or pinch beginning on a node must not open its resources on release.
        if (state.current.mobile && suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation() }
      }}
      onFocusCapture={event => {
        if (!state.current.mobile || !(event.target instanceof HTMLElement) || !event.target.matches('.graph-node-parent:focus-visible')) return
        const rect = event.target.getBoundingClientRect()
        const frame = event.currentTarget.getBoundingClientRect()
        const shift = (start: number, end: number, low: number, high: number) => start < low ? low - start : end > high ? high - end : 0
        const view = state.current.view
        apply({ ...view, x: view.x + shift(rect.left, rect.right, frame.left + 16, frame.right - 16),
          y: view.y + shift(rect.top, rect.bottom, frame.top + 16, frame.bottom - 16) })
      }}>
      <div ref={contentRef} className="graph-viewport-content" style={display.mobile ? { transform: `translate(${display.view.x}px, ${display.view.y}px) scale(${display.view.scale})` } : undefined}>
        {children}
      </div>
    </div>
  </>
}
