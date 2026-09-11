import { apiUrl } from './config'
import { ApiError, type ApiErrorBody } from './types'

export type ResponseValidator<T> = (value: unknown) => T

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseErrorBody(value: unknown): ApiErrorBody | null {
  if (!isRecord(value) || !isRecord(value.error)) return null
  const { code, message } = value.error
  if (typeof code !== 'string' || typeof message !== 'string') return null
  return { error: { code, message } }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError(
      response.ok ? 0 : response.status,
      'INVALID_RESPONSE',
      '服务返回了无法解析的数据。',
    )
  }
}

function buildInit(options: ApiRequestOptions = {}): RequestInit {
  const { body, ...requestOptions } = options
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  const init: RequestInit = {
    ...requestOptions,
    credentials: 'include',
    headers,
  }

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json')
    init.body = JSON.stringify(body)
  }

  return init
}

export async function apiJson<T>(
  path: string,
  options: ApiRequestOptions,
  validate: ResponseValidator<T>,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), buildInit(options))
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '暂时无法连接服务，请稍后重试。')
  }

  const payload = await readJson(response)
  if (!response.ok) {
    const body = parseErrorBody(payload)
    throw new ApiError(
      response.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.message ?? '请求没有成功，请稍后重试。',
    )
  }

  try {
    return validate(payload)
  } catch {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
}

export async function apiVoid(
  path: string,
  options: ApiRequestOptions,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), buildInit(options))
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '暂时无法连接服务，请稍后重试。')
  }

  const payload = response.status === 204 ? null : await readJson(response)
  if (!response.ok) {
    const body = parseErrorBody(payload)
    throw new ApiError(
      response.status,
      body?.error.code ?? 'HTTP_ERROR',
      body?.error.message ?? '请求没有成功，请稍后重试。',
    )
  }
}
