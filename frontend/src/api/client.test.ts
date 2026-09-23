import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listAll, request } from './client'

function envelope(data: unknown, meta?: object, status = 200) {
  return new Response(JSON.stringify({ data, meta }), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => { document.cookie = 'csrftoken=test-token; path=/' })
afterEach(() => vi.unstubAllGlobals())

describe('API client', () => {
  it('uses the session, CSRF and JSON for a write', async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope({ id: 'step-1' }))
    vi.stubGlobal('fetch', fetcher)
    expect(await request('/admin/courses', { method: 'POST', body: { title: 'Курс' } })).toEqual({ id: 'step-1' })
    const [path, options] = fetcher.mock.calls[0]
    expect(path).toBe('/api/v1/admin/courses')
    expect(options.credentials).toBe('include')
    expect(options.headers.get('X-CSRFToken')).toBe('test-token')
    expect(options.headers.get('Content-Type')).toBe('application/json')
    expect(options.body).toBe(JSON.stringify({ title: 'Курс' }))
  })

  it('sends multipart files without manually setting Content-Type', async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope({ id: 'attempt-1' }))
    vi.stubGlobal('fetch', fetcher)
    const data = new FormData()
    data.append('file', new File(['demo'], 'demo.txt'))
    await request('/student/test', { method: 'POST', body: data, idempotencyKey: 'unique-key' })
    const options = fetcher.mock.calls[0][1]
    expect(options.body).toBe(data)
    expect(options.headers.get('Content-Type')).toBeNull()
    expect(options.headers.get('Idempotency-Key')).toBe('unique-key')
  })

  it('surfaces contract error codes and field messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {
      code: 'validation_error', message: 'Проверьте данные', fields: { title: ['Обязательно'] },
    } }), { status: 400 })))
    await expect(request('/admin/courses')).rejects.toMatchObject({
      status: 400, code: 'validation_error', message: 'Проверьте данные', fields: { title: ['Обязательно'] },
    })
  })

  it('loads every page of a selector', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(envelope(['a', 'b'], { page: 1, page_size: 2, total: 3 }))
      .mockResolvedValueOnce(envelope(['c'], { page: 2, page_size: 2, total: 3 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await listAll('/admin/users?role=student')).toEqual(['a', 'b', 'c'])
    expect(fetcher.mock.calls[0][0]).toContain('role=student&page=1&page_size=100')
    expect(fetcher.mock.calls[1][0]).toContain('role=student&page=2&page_size=100')
  })
})
