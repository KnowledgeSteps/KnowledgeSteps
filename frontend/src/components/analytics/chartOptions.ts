import type { EChartsCoreOption } from 'echarts/core'
import { visualTokens as t } from '../../design/theme'
import type { AnalyticsDay } from '../../api/analytics'

export const seriesColors = [t.primary, t['blue-medium'], t['text-main']]
const textStyle = { fontFamily: t['font-family'], color: t['text-sub'] }
const grid = { left: 12, right: 24, top: 28, bottom: 12, containLabel: true }
const yAxis = { type: 'value', min: 0, minInterval: 1, axisLabel: { color: t['text-muted'] }, splitLine: { lineStyle: { color: t.border, type: 'dashed' } } }

export function lineOptions(days: AnalyticsDay[]): EChartsCoreOption {
  const ordered = [...days].reverse()
  return { textStyle, color: seriesColors, grid, tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    xAxis: { type: 'category', boundaryGap: false, data: ordered.map(d => d.day), axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false }, axisLabel: { color: t['text-muted'], hideOverlap: true } }, yAxis,
    series: (['pv', 'uv', 'ip'] as const).map((key, i) => ({ name: ['访问次数 PV', '访问人数 UV', '独立 IP 数'][i],
      type: 'line', smooth: 0.2, smoothMonotone: 'x', symbol: 'circle', symbolSize: 5, data: ordered.map(d => d[key]),
      lineStyle: { width: 2, type: i === 2 ? 'dashed' : 'solid' }, emphasis: { focus: 'series' } })) }
}
export function barOptions(labels: string[], values: number[]): EChartsCoreOption {
  return { textStyle, grid, color: [t.primary], tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    xAxis: { type: 'category', data: labels, axisLabel: { color: t['text-muted'], hideOverlap: true }, axisLine: { lineStyle: { color: t.border } }, axisTick: { show: false } }, yAxis,
    series: [{ name: '访问次数', type: 'bar', data: values, barWidth: 8, showBackground: true, backgroundStyle: { color: t['bg-subtle'] }, itemStyle: { borderRadius: [2, 2, 0, 0] } }] }
}
