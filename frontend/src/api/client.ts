import type { ApiEnvelope, Paginated } from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let csrfToken: string | null = null

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null
}

export async function ensureCsrf(): Promise<string> {
  const existing = cookie('csrftoken') ?? csrfToken
  if (existing) return existing
  let response: Response
  try { response = await fetch('/api/v1/auth/csrf', { credentials: 'include' }) }
  catch { throw new ApiError('Нет связи с сервером. Проверьте подключение и повторите попытку.', 0, 'network_error') }
  if (!response.ok) throw new ApiError('Не удалось подготовить безопасный вход', response.status, 'csrf_error')
  const envelope = (await response.json()) as ApiEnvelope<{ csrf_token: string }>
  csrfToken = envelope.data.csrf_token
  return csrfToken
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: object | FormData
  idempotencyKey?: string
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const method = options.method ?? 'GET'
  const headers = new Headers()
  const form = options.body instanceof FormData
  if (options.body !== undefined && !form) headers.set('Content-Type', 'application/json')
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)
  if (method !== 'GET') headers.set('X-CSRFToken', await ensureCsrf())

  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'include',
      headers,
      body: options.body === undefined ? undefined : options.body instanceof FormData ? options.body : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте подключение и повторите попытку.', 0, 'network_error')
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new ApiError(response.status === 413 ? 'Файл слишком большой' : 'Сервер вернул непонятный ответ', response.status, 'invalid_response')
  }
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('webeducation:unauthorized'))
    const error = (payload as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } }).error
    throw new ApiError(error?.message ?? `Ошибка сервера (${response.status})`, response.status, error?.code ?? 'request_error', error?.fields)
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new ApiError('Сервер вернул неполные данные', response.status, 'invalid_response')
  }
  return payload as ApiEnvelope<T>
}

export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  return (await send<T>(path, options)).data
}

export async function list<T>(path: string): Promise<Paginated<T>> {
  return (await send<T[]>(path)) as Paginated<T>
}

export function withPage(path: string, page: number, pageSize = 20): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}page=${page}&page_size=${pageSize}`
}

export async function listAll<T>(path: string): Promise<T[]> {
  const items: T[] = []
  let page = 1
  while (true) {
    const result = await list<T>(withPage(path, page, 100))
    items.push(...result.data)
    if (items.length >= result.meta.total || result.data.length === 0) return items
    page += 1
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.fields && Object.values(error.fields).flat().join(' · ')
    return detail ? `${error.message}: ${detail}` : error.message
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка'
}
