import { ApiError } from './types'

export function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value as Record<string, unknown>
}

export function stringValue(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value
}

export function numberValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value
}

export function booleanValue(value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value
}

export function nullableString(value: unknown): string | null {
  if (value === null) return null
  return stringValue(value)
}

export function nullableNumber(value: unknown): number | null {
  if (value === null) return null
  return numberValue(value)
}

export function nullableObject<T>(
  value: unknown,
  parse: (record: Record<string, unknown>) => T,
): T | null {
  if (value === null) return null
  return parse(objectValue(value))
}

export function arrayValue<T>(
  value: unknown,
  parse: (item: unknown) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value.map(parse)
}

export function enumValue<const T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) {
    throw new ApiError(0, 'INVALID_RESPONSE', '服务返回的数据格式不正确。')
  }
  return value as T[number]
}
