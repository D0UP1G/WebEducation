import type { ApiEnvelope, Paginated } from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fields?: Record<string, string[]>,
    readonly requestId?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

let csrfToken: string | null = null

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

async function readPayload(response: Response): Promise<unknown> {
  const body = await response.text()
  if (!body.trim()) return null
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseMeta(payload: unknown): Record<string, unknown> | undefined {
  if (!isRecord(payload) || !isRecord(payload.meta)) return undefined
  return payload.meta
}

function statusMessage(status: number): string {
  switch (status) {
    case 400: return 'Проверьте введённые данные'
    case 401: return 'Сессия истекла. Войдите снова'
    case 403: return 'Недостаточно прав для этого действия'
    case 404: return 'Запрошенный ресурс не найден'
    case 409: return 'Данные изменились. Обновите страницу и повторите действие'
    case 413: return 'Переданные данные слишком большие'
    case 429: return 'Слишком много запросов. Попробуйте позже'
    case 500: return 'Внутренняя ошибка сервера'
    case 502:
    case 503:
    case 504: return 'Сервер временно недоступен. Попробуйте позже'
    default: return `Ошибка HTTP ${status}`
  }
}

function fieldErrors(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).map(([key, messages]) => [
    key,
    Array.isArray(messages) ? messages.map(String) : [String(messages)],
  ] as const)
  return Object.fromEntries(entries)
}

function apiError(response: Response, payload: unknown, fallbackRequestId: string, invalidSuccess = false): ApiError {
  const root = isRecord(payload) ? payload : undefined
  const rawError = root && isRecord(root.error) ? root.error : undefined
  const meta = responseMeta(payload)
  const requestId = response.headers.get('X-Request-ID')
    ?? (typeof meta?.request_id === 'string' ? meta.request_id : fallbackRequestId)

  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('webeducation:unauthorized'))
  }

  if (invalidSuccess) {
    return new ApiError(
      'Сервер вернул ответ в неподдерживаемом формате',
      response.status,
      'invalid_response',
      undefined,
      requestId,
    )
  }

  const code = typeof rawError?.code === 'string' ? rawError.code : `http_${response.status}`
  const message = typeof rawError?.message === 'string' ? rawError.message : statusMessage(response.status)
  return new ApiError(message, response.status, code, fieldErrors(rawError?.fields), requestId)
}

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const value = document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null
}

export async function ensureCsrf(): Promise<string> {
  const existing = cookie('csrftoken') ?? csrfToken
  if (existing) return existing
  const requestId = createRequestId()
  let response: Response
  try { response = await fetch('/api/v1/auth/csrf', { credentials: 'include', headers: { 'X-Request-ID': requestId } }) }
  catch { throw new ApiError('Нет связи с сервером. Проверьте подключение и повторите попытку.', 0, 'network_error') }
  let payload: unknown
  try { payload = await readPayload(response) }
  catch { payload = undefined }
  if (!response.ok) throw apiError(response, payload, requestId)
  if (!isRecord(payload) || !isRecord(payload.data) || typeof payload.data.csrf_token !== 'string') {
    throw apiError(response, payload, requestId, true)
  }
  csrfToken = payload.data.csrf_token
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
  const requestId = createRequestId()
  headers.set('X-Request-ID', requestId)
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
  try { payload = await readPayload(response) }
  catch { payload = undefined }
  if (!response.ok) {
    throw apiError(response, payload, requestId)
  }
  if (!isRecord(payload) || !('data' in payload)) {
    throw apiError(response, payload, requestId, true)
  }
  return payload as unknown as ApiEnvelope<T>
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
    const description = detail ? `${error.message}: ${detail}` : error.message
    const status = error.status > 0 ? `HTTP ${error.status}` : ''
    const heading = [status, error.code].filter(Boolean).join(' · ')
    const request = error.requestId ? ` · ID запроса: ${error.requestId}` : ''
    return `${heading}: ${description}${request}`
  }
  return error instanceof Error ? error.message : 'Неизвестная ошибка (unknown_error)'
}
