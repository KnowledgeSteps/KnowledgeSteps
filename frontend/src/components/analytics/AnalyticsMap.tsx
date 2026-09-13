import { useEffect, useMemo, useState } from 'react'
import { registerMap, type EChartsCoreOption } from 'echarts/core'
import { Alert, Button, Skeleton } from 'antd'
import type { AnalyticsBucket } from '../../api/analytics'
import { visualTokens as t } from '../../design/theme'
import { AnalyticsChart } from './AnalyticsChart'

const loaded = new Set<string>()
const aliases: Record<string, string> = { 中国: 'China', 美国: 'United States of America', 'United States': 'United States of America',
  俄罗斯: 'Russia', 'Russian Federation': 'Russia', 韩国: 'South Korea', 日本: 'Japan', 英国: 'United Kingdom', 德国: 'Germany',
  法国: 'France', 加拿大: 'Canada', 澳大利亚: 'Australia', 新加坡: 'Singapore', 台湾省: 'Taiwan' }

export function AnalyticsMap({ kind, values }: { kind: 'china' | 'world'; values: AnalyticsBucket[] }) {
  const [ready, setReady] = useState('')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    async function load() {
      try {
        if (!loaded.has(kind)) {
          const response = await fetch(`/maps/${kind}.json`, { signal: controller.signal })
          if (!response.ok) throw new Error('Map unavailable')
          const json = await response.json()
          if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) throw new Error('Invalid map')
          registerMap(kind, json)
          loaded.add(kind)
        }
        if (!controller.signal.aborted) { setReady(kind); setError('') }
      } catch { if (active) setError('地图暂时无法加载，可重试；左侧地区数据仍可查看。') }
      finally { clearTimeout(timer) }
    }
    void load()
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [kind, attempt])
  const option: EChartsCoreOption = useMemo(() => ({
    textStyle: { fontFamily: t['font-family'] }, tooltip: { trigger: 'item', renderMode: 'richText', confine: true },
    visualMap: { min: 0, max: Math.max(1, ...values.map(v => v.value)), orient: 'horizontal', left: 'center', bottom: 0,
      text: ['高', '低'], inRange: { color: [t['bg-subtle'], t['blue-light'], t.primary] }, textStyle: { color: t['text-muted'] } },
    series: [{ name: '访问次数', type: 'map', map: kind, roam: false, top: 10, bottom: 55,
      itemStyle: { areaColor: t['bg-subtle'], borderColor: t['bg-card'], borderWidth: 1 }, emphasis: { label: { show: true }, itemStyle: { areaColor: t['blue-light'] } },
      data: values.filter(v => !['未知', '内网', '未采集'].includes(v.name)).map(v => ({ name: kind === 'world' ? aliases[v.name] ?? v.name : v.name, value: v.value })) }],
  }), [kind, values])
  if (error) return <Alert type="warning" title={error} action={<Button onClick={() => setAttempt(v => v + 1)}>重试</Button>} />
  if (ready !== kind) return <Skeleton active className="analytics-map-loading" />
  return <AnalyticsChart option={option} label={kind === 'china' ? '中国省级访问分布，详细数值见地区列表' : '世界访问分布，详细数值见地区列表'} className="analytics-map" />
}
