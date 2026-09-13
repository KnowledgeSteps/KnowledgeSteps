import { apiJson } from './http'
import { numberValue, objectValue, stringValue } from './validators'
import { ensureCurrentUser, invalidateCurrentUser, isCurrentAuthentication } from './auth'
import { ApiError } from './types'

async function authenticatedRead<T>(read: () => Promise<T>): Promise<T> {
  const user = await ensureCurrentUser()
  try {
    const data = await read()
    if (!isCurrentAuthentication(user)) throw new ApiError(401, 'AUTH_CHANGED', '登录状态已变化，请重新登录。')
    return data
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) invalidateCurrentUser(user)
    throw error
  }
}

export interface AnalyticsDay { day: string; pv: number; uv: number; ip: number }
export interface AnalyticsBucket { name: string; value: number }
export interface AnalyticsReport {
  timezone: string; days: AnalyticsDay[]; hours: AnalyticsBucket[]; countries: AnalyticsBucket[]
  regions: AnalyticsBucket[]; systems: AnalyticsBucket[]; browsers: AnalyticsBucket[]; ips: AnalyticsBucket[]
}
export interface AnalyticsVisit { id: number; time: string; page: string; ip: string; country: string; region: string; os: string; browser: string }
export interface AnalyticsVisits { total: number; page: number; pageSize: number; items: AnalyticsVisit[] }
export type AnalyticsRange = [string, string]
function query(range?: AnalyticsRange) { return range ? `?start=${range[0]}&end=${range[1]}` : '' }
function buckets(value: unknown): AnalyticsBucket[] {
  if (!Array.isArray(value)) throw new Error('Invalid buckets')
  return value.map(value => { const b = objectValue(value); return { name: stringValue(b.name), value: numberValue(b.value) } })
}

export function getAnalytics(signal: AbortSignal, range?: AnalyticsRange): Promise<AnalyticsReport> {
  return authenticatedRead(() => apiJson(`/api/v1/analytics/summary${query(range)}`, { method: 'GET', cache: 'no-store', signal }, value => {
    const report = objectValue(value)
    if (!Array.isArray(report.days)) throw new Error('Invalid days')
    return { timezone: stringValue(report.timezone), hours: buckets(report.hours), countries: buckets(report.countries),
      regions: buckets(report.regions), systems: buckets(report.systems), browsers: buckets(report.browsers), ips: buckets(report.ips), days: report.days.map(value => {
      const day = objectValue(value)
      return { day: stringValue(day.day), pv: numberValue(day.pv), uv: numberValue(day.uv), ip: numberValue(day.ip) }
    }) }
  }))
}

export function getAnalyticsVisits(signal: AbortSignal, range: AnalyticsRange, page: number): Promise<AnalyticsVisits> {
  return authenticatedRead(() => apiJson(`/api/v1/analytics/visits${query(range)}&page=${page}`, { method: 'GET', cache: 'no-store', signal }, value => {
    const report = objectValue(value)
    if (!Array.isArray(report.items)) throw new Error('Invalid visits')
    return { total: numberValue(report.total), page: numberValue(report.page), pageSize: numberValue(report.pageSize), items: report.items.map(value => {
      const v = objectValue(value)
      return { id: numberValue(v.id), time: stringValue(v.time), page: stringValue(v.page), ip: stringValue(v.ip),
        country: stringValue(v.country), region: stringValue(v.region), os: stringValue(v.os), browser: stringValue(v.browser) }
    }) }
  }))
}
