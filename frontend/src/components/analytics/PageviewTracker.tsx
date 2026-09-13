import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { apiUrl, isMockMode } from '../../api/config'
import { useAuth } from '../../hooks/useAuth'
import { analyticsPage } from './pageview'

export function PageviewTracker() {
  const location = useLocation()
  const auth = useAuth()
  const last = useRef<string | null>(null)
  useEffect(() => {
    const page = analyticsPage(location.pathname)
    const key = `${location.key}:${location.pathname}`
    if (isMockMode || !page || auth.user?.role === 'ADMIN' || navigator.doNotTrack === '1'
      || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl
      || !['anonymous', 'authenticated'].includes(auth.status) || last.current === key) return
    const controller = new AbortController()
    let deadline: ReturnType<typeof setTimeout> | undefined
    // Coalesce redirects and React StrictMode effect replay into one settled pageview.
    const timer = setTimeout(() => {
      last.current = key
      deadline = setTimeout(() => controller.abort(), 3000)
      void fetch(apiUrl('/api/v1/analytics/pageviews'), {
        method: 'POST', credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-Ksteps-Analytics': '1' },
        body: JSON.stringify({ eventId: crypto.randomUUID(), page }),
      }).catch(() => undefined).finally(() => clearTimeout(deadline))
    }, 300)
    return () => { clearTimeout(timer); clearTimeout(deadline); controller.abort() }
  }, [location.key, location.pathname, auth.status, auth.user?.role])
  return null
}
