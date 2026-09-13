import { useEffect, useRef } from 'react'
import { init, use as registerCharts, type EChartsCoreOption } from 'echarts/core'
import { LineChart, BarChart, MapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent, GeoComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

registerCharts([LineChart, BarChart, MapChart, GridComponent, TooltipComponent, VisualMapComponent, GeoComponent, AriaComponent, SVGRenderer])

export function AnalyticsChart({ option, label, className = '' }: { option: EChartsCoreOption; label: string; className?: string }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!container.current) return
    const chart = init(container.current, undefined, { renderer: 'svg' })
    chart.setOption({ ...option, animation: !matchMedia('(prefers-reduced-motion: reduce)').matches, aria: { enabled: true, label: { description: label } } })
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container.current)
    return () => { observer.disconnect(); chart.dispose() }
  }, [option, label])
  return <div className={`analytics-chart ${className}`} ref={container} role="img" aria-label={label} />
}
