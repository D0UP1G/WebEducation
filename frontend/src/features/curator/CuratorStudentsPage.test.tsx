import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { api } from '../../api'
import type { Progress } from '../../api/types'
import { CuratorStudentsPage } from './CuratorStudentsPage'

afterEach(() => vi.restoreAllMocks())

const progress: Progress = {
  completed_steps: 1, total_steps: 2, earned_points: 5, available_points: 10,
  completion_percent: 50, rating_percent: 50, next_step_id: 'step-2', next_action: 'complete_step',
  steps: [{ step_id: 'step-1', title: 'Теория', status: 'accepted', unlocked: true, earned_points: 5, max_points: 5 }],
}

it('shows one row per student and expands that student’s courses and course progress', async () => {
  vi.spyOn(api.curator, 'students').mockResolvedValue({
    data: [{ id: 'student-1', display_name: 'Иван', role: 'student',
      lag_signals: [], enrollments: [
        { id: 'enrollment-1', title: 'Алгоритмика', progress },
        { id: 'enrollment-2', title: 'Python', progress },
      ] }],
    meta: { page: 1, page_size: 20, total: 1 },
  })
  const detail = vi.spyOn(api.curator, 'studentProgress').mockResolvedValue(progress)
  render(<CuratorStudentsPage />)

  expect(await screen.findByRole('table')).toBeTruthy()
  expect(screen.getByText('Иван')).toBeTruthy()
  expect(screen.getAllByRole('row')).toHaveLength(2)
  expect(screen.queryByText('Алгоритмика')).toBeNull()
  expect(screen.getByText('В графике')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Показать курсы' }))
  expect(screen.getByText('Алгоритмика')).toBeTruthy()
  expect(screen.getByText('Python')).toBeTruthy()
  expect(screen.getAllByText('1 из 2 шагов · 5 из 10 баллов')).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Показать прогресс' })[0])
  expect(await screen.findByText('Зачтено')).toBeTruthy()
  expect(detail).toHaveBeenCalledWith('student-1', 'enrollment-1')
})

it('does not invent a pace signal when the API omits lag data', async () => {
  vi.spyOn(api.curator, 'students').mockResolvedValue({
    data: [{ id: 'student-2', display_name: 'Мария', role: 'student', enrollments: [] }],
    meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<CuratorStudentsPage />)

  expect(await screen.findByText('Нет данных')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Показать курсы' }))
  expect(screen.getByText('Курсы пока не назначены.')).toBeTruthy()
  expect(screen.queryByText('В графике')).toBeNull()
})

it('searches all curator students by name and resets the filter', async () => {
  const list = vi.spyOn(api.curator, 'students').mockImplementation(async (_page, search = '') => ({
    data: search === 'Мария'
      ? [{ id: 'student-2', display_name: 'Мария', role: 'student', enrollments: [] }]
      : [{ id: 'student-1', display_name: 'Иван', role: 'student', enrollments: [] }],
    meta: { page: 1, page_size: 20, total: 1 },
  }))
  render(<CuratorStudentsPage />)

  expect(await screen.findByText('Иван')).toBeTruthy()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Поиск ученика' }), { target: { value: '  Мария  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Найти' }))
  expect(await screen.findByText('Мария')).toBeTruthy()
  expect(list).toHaveBeenCalledWith(1, 'Мария')
  expect(screen.queryByText('Иван')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Сбросить' }))
  expect(await screen.findByText('Иван')).toBeTruthy()
  expect(list).toHaveBeenCalledWith(1, '')
})
