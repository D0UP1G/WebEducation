import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api } from '../../api'
import { AdminUsersPage } from './AdminUsersPage'

afterEach(() => vi.restoreAllMocks())

it('creates a student without an admin-provided password and shows a setup link', async () => {
  const list = vi.spyOn(api.admin, 'manageUsers').mockResolvedValue({
    data: [], meta: { page: 1, page_size: 20, total: 0 },
  })
  const create = vi.spyOn(api.admin, 'createUser').mockResolvedValue({
    id: 's1', username: 'student1', display_name: 'Иван', role: 'student', is_active: true,
    setup_url: '/set-password/uid/token',
  })
  render(<AdminUsersPage />)
  await screen.findByText('Пользователей пока нет.')

  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'student1' } })
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Иван' } })
  fireEvent.click(screen.getByRole('button', { name: 'Создать и получить ссылку' }))

  await waitFor(() => expect(create).toHaveBeenCalledWith({
    username: 'student1', display_name: 'Иван', role: 'student',
  }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  const setupLink = screen.getByRole('link', { name: 'http://localhost:3000/set-password/uid/token' })
  expect(setupLink.getAttribute('href')).toBe('/set-password/uid/token')
})

it('lists inactive curators and can activate one', async () => {
  const list = vi.spyOn(api.admin, 'manageUsers').mockImplementation(async (role) => ({
    data: role === 'curator' ? [{ id: 'c1', username: 'curator1', display_name: 'Ольга', role: 'curator', is_active: false }] : [],
    meta: { page: 1, page_size: 20, total: role === 'curator' ? 1 : 0 },
  }))
  const toggle = vi.spyOn(api.admin, 'setUserActive').mockResolvedValue({
    id: 'c1', username: 'curator1', display_name: 'Ольга', role: 'curator', is_active: true,
  })
  render(<AdminUsersPage />)
  fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'curator' } })
  expect(await screen.findByText('Логин: curator1')).toBeTruthy()
  expect(screen.getByText('Отключён')).toBeTruthy()
  expect(list).toHaveBeenCalledWith('curator', 1)
  fireEvent.click(screen.getByRole('button', { name: 'Активировать' }))
  await waitFor(() => expect(toggle).toHaveBeenCalledWith('c1', true))
})
