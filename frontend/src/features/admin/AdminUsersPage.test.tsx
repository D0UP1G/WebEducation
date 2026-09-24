import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { api } from '../../api'
import { AdminUsersPage } from './AdminUsersPage'

afterEach(() => vi.restoreAllMocks())

it('creates a student without rendering the password and refreshes the list', async () => {
  const list = vi.spyOn(api.admin, 'manageUsers').mockResolvedValue({
    data: [], meta: { page: 1, page_size: 20, total: 0 },
  })
  const create = vi.spyOn(api.admin, 'createUser').mockResolvedValue({
    id: 's1', username: 'student1', display_name: 'Иван', role: 'student', is_active: true,
  })
  render(<AdminUsersPage />)
  await screen.findByText('Пользователей пока нет.')

  fireEvent.change(screen.getByLabelText('Логин'), { target: { value: 'student1' } })
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Иван' } })
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'StrongPass!483' } })
  fireEvent.click(screen.getByRole('button', { name: 'Создать' }))

  await waitFor(() => expect(create).toHaveBeenCalledWith({
    username: 'student1', display_name: 'Иван', role: 'student', password: 'StrongPass!483',
  }))
  await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
  expect((screen.getByLabelText('Пароль') as HTMLInputElement).value).toBe('')
  expect(screen.queryByText('StrongPass!483')).toBeNull()
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
  expect(await screen.findByText(/Логин: curator1 · Отключён/)).toBeTruthy()
  expect(list).toHaveBeenCalledWith('curator', 1)
  fireEvent.click(screen.getByRole('button', { name: 'Активировать' }))
  await waitFor(() => expect(toggle).toHaveBeenCalledWith('c1', true))
})
