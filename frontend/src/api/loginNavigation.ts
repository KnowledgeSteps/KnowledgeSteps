// Return only to routes that can display a task; reject external URLs and login loops.
export function safeReturnTo(value: string | null): string {
  return value && /^\/sessions\/[1-9][0-9]{0,18}\/(questions|result)$/.test(value)
    ? value
    : '/'
}

export function loginUrl(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
