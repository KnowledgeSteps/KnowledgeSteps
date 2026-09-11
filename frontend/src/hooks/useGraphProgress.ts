import { useEffect, useRef, useState } from 'react'
import type { SessionDetail } from '../api/types'
import { GraphProgressTimeline } from '../components/waiting/graphProgress'

export function useGraphProgress(session: SessionDetail | null) {
  const timeline = useRef<{ id: string; value: GraphProgressTimeline } | null>(null)
  const [view, setView] = useState({ id: '', percent: 0, settled: true, observedGraph: false })
  const id = session?.sessionId
  const status = session?.status
  useEffect(() => {
    if (!id || !status) return
    if (timeline.current?.id !== id) {
      timeline.current = { id, value: new GraphProgressTimeline(performance.now(), status === 'GENERATING_GRAPH') }
    }
    const current = timeline.current.value
    let frame: number
    const tick = () => {
      const sample = current.sample(performance.now(), status !== 'GENERATING_GRAPH')
      setView({ id, ...sample, observedGraph: current.observedGraph })
      if (!sample.settled) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [id, status])
  const matching = view.id === id
  return {
    percent: matching ? view.percent : status === 'GENERATING_GRAPH' ? 0 : 100,
    finishing: matching && view.observedGraph && !view.settled,
  }
}
