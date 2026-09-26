import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorMessage, listAll, request } from './client'
import { api } from './index'

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

  it('assigns a course as active by default', async () => {
    const fetcher = vi.fn().mockResolvedValue(envelope({ id: 'enrollment-1' }))
    vi.stubGlobal('fetch', fetcher)

    await api.admin.assign('course-1', 'student-1', 'curator-1')

    const [path, options] = fetcher.mock.calls[0]
    expect(path).toBe('/api/v1/admin/enrollments')
    expect(JSON.parse(options.body)).toEqual({
      course_id: 'course-1',
      student_id: 'student-1',
      curator_id: 'curator-1',
      status: 'active',
    })
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

  it('reports a useful HTTP code and request id when a proxy returns HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>upstream failure</html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html', 'X-Request-ID': 'proxy-request-123' },
    })))

    let caught: unknown
    try { await request('/admin/enrollments', { method: 'POST', body: {} }) }
    catch (error) { caught = error }

    expect(caught).toMatchObject({ status: 502, code: 'http_502', requestId: 'proxy-request-123' })
    expect(errorMessage(caught)).toContain('HTTP 502 · http_502')
    expect(errorMessage(caught)).toContain('ID запроса: proxy-request-123')
    expect(errorMessage(caught)).not.toContain('непонятный ответ')
  })

  it('includes the API status and error code in the user-facing message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'state_conflict', message: 'Этот курс уже назначен ученику' },
      meta: { request_id: 'assignment-request-123' },
    }), { status: 409 })))

    let caught: unknown
    try { await request('/admin/enrollments', { method: 'POST', body: {} }) }
    catch (error) { caught = error }

    expect(errorMessage(caught)).toContain('HTTP 409 · state_conflict')
    expect(errorMessage(caught)).toContain('Этот курс уже назначен ученику')
    expect(errorMessage(caught)).toContain('ID запроса: assignment-request-123')
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
