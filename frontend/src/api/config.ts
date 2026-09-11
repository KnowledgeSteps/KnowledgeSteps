export type DataMode = 'mock' | 'api'

function readDataMode(): DataMode {
  const mode = import.meta.env.VITE_DATA_MODE
  if (mode === undefined || mode === '' || mode === 'mock') return 'mock'
  if (mode === 'api') return 'api'
  throw new Error(`Unsupported VITE_DATA_MODE: ${mode}`)
}

export const dataMode = readDataMode()
export const isMockMode = dataMode === 'mock'
export const isApiMode = dataMode === 'api'

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
export const apiBaseUrl = rawBaseUrl.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}
