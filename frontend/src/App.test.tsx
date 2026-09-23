import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { api } from './api'
import { ApiError } from './api/client'
import { App } from './App'
import { AuthProvider } from './auth/AuthContext'

afterEach(() => vi.restoreAllMocks())

function mount(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>)
}

it('redirects an unauthenticated visitor to login', async () => {
  vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError('Войдите', 401, 'unauthenticated'))
  mount('/student/courses')
  expect(await screen.findByRole('heading', { name: 'Вход в WebEducation' })).toBeTruthy()
})

it('keeps a student out of admin routes and opens their courses', async () => {
  vi.spyOn(api.auth, 'me').mockResolvedValue({ id: 'student-1', role: 'student', display_name: 'Иван' })
  vi.spyOn(api.student, 'courses').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  mount('/admin/courses')
  expect(await screen.findByRole('heading', { name: 'Мои курсы' })).toBeTruthy()
  expect(api.student.courses).toHaveBeenCalled()
})

it('logs in and navigates to the correct role home', async () => {
  vi.spyOn(api.auth, 'me').mockRejectedValue(new ApiError('Войдите', 401, 'unauthenticated'))
  vi.spyOn(api.auth, 'login').mockResolvedValue({ id: 'curator-1', role: 'curator', display_name: 'Куратор' })
  vi.spyOn(api.curator, 'students').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  vi.spyOn(api.curator, 'reviews').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  vi.spyOn(api.curator, 'questions').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  mount('/login')
  const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'Вход в WebEducation' })
  await user.type(screen.getByRole('textbox', { name: 'Имя пользователя' }), 'curator_demo')
  await user.type(screen.getByLabelText('Пароль'), 'demo')
  await user.click(screen.getByRole('button', { name: 'Войти' }))
  await waitFor(() => expect(api.auth.login).toHaveBeenCalledWith('curator_demo', 'demo'))
  expect(await screen.findByRole('heading', { name: 'Обзор куратора' })).toBeTruthy()
})

it('returns to login when the session expires during a visit', async () => {
  vi.spyOn(api.auth, 'me').mockResolvedValue({ id: 'student-1', role: 'student', display_name: 'Иван' })
  vi.spyOn(api.student, 'courses').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  mount('/student/courses')
  await screen.findByRole('heading', { name: 'Мои курсы' })
  window.dispatchEvent(new Event('webeducation:unauthorized'))
  expect(await screen.findByRole('heading', { name: 'Вход в WebEducation' })).toBeTruthy()
})
