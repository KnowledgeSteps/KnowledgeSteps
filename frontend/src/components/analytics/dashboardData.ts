import type { AnalyticsDay } from '../../api/analytics'

export function weekdayValues(days: AnalyticsDay[]): number[] {
  const values = Array<number>(7).fill(0)
  for (const day of days) values[(new Date(`${day.day}T00:00:00Z`).getUTCDay() + 6) % 7] += day.pv
  return values
}
export function dailyCsv(days: AnalyticsDay[]): string {
  return '\uFEFF日期（北京时间）,访问次数PV,访问人数UV,独立IP数\r\n' + [...days].reverse().map(d =>
    [d.day, d.pv, d.uv, d.ip].map(v => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\r\n')
}
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
