import { safeReturnTo } from './loginNavigation'

export function zhihuLoginUrl(returnTo: string | null): string {
  return `/api/v1/auth/zhihu/start?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}

// Only display local messages; OAuth callback parameters may contain untrusted text.
export function oauthErrorMessage(code: string | null): string | null {
  switch (code) {
    case null: return null
    case 'OAUTH_UNAVAILABLE': return '知乎登录暂时不可用，请稍后重试。'
    case 'OAUTH_STATE_INVALID': return '本次授权已过期或失效，请重新点击知乎登录。'
    case 'OAUTH_CANCELLED': return '你已取消知乎授权，可以重新登录。'
    default: return '知乎登录未完成，请重新授权登录。'
  }
}
