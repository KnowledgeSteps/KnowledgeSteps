// Never send a target, session ID, query string, OAuth code or full URL.
export function analyticsPage(pathname: string): string | null {
  if (pathname === '/') return 'home'
  if (pathname === '/login') return 'login'
  if (pathname === '/history') return 'history'
  if (/^\/sessions\/[^/]+\/questions\/?$/.test(pathname)) return 'questions'
  if (/^\/sessions\/[^/]+\/result\/?$/.test(pathname)) return 'result'
  return null
}
