// Return only to routes that can display a task; reject external URLs and login loops.
export function safeReturnTo(value: string | null): string {
  if (value === '/history' || value === '/admin/analytics') return value
  const sessionPath = value?.match(/^\/sessions\/[1-9][0-9]{0,18}\/(questions|result)$/)?.[0]
  return sessionPath && sessionPath === value ? sessionPath : '/'
}

export function loginUrl(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
