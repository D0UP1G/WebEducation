import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { api } from '../../api'
import { CuratorStudentsPage } from './CuratorStudentsPage'

afterEach(() => vi.restoreAllMocks())

it('shows real student progress in the design table and expands the course', async () => {
  vi.spyOn(api.curator, 'students').mockResolvedValue({
    data: [{ id: 'student-1', display_name: 'Иван', role: 'student',
      lag_signals: [], enrollments: [{ id: 'enrollment-1', title: 'Алгоритмика' }] }],
    meta: { page: 1, page_size: 20, total: 1 },
  })
  const detail = vi.spyOn(api.curator, 'studentProgress').mockResolvedValue({
    completed_steps: 1, total_steps: 2, earned_points: 5, available_points: 10,
    completion_percent: 50, rating_percent: 50, next_step_id: 'step-2', next_action: 'complete_step',
    steps: [{ step_id: 'step-1', title: 'Теория', status: 'accepted', unlocked: true, earned_points: 5, max_points: 5 }],
  })
  render(<CuratorStudentsPage />)

  expect(await screen.findByRole('table')).toBeTruthy()
  expect(screen.getByText('Иван')).toBeTruthy()
  expect(screen.getByText('Алгоритмика')).toBeTruthy()
  expect(screen.getByText('В графике')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Открыть' }))
  expect(await screen.findByText('1 из 2 шагов · 5 из 10 баллов')).toBeTruthy()
  expect(screen.getByText('Зачтено')).toBeTruthy()
  expect(detail).toHaveBeenCalledWith('student-1', 'enrollment-1')
})

it('does not invent a pace signal when the API omits lag data', async () => {
  vi.spyOn(api.curator, 'students').mockResolvedValue({
    data: [{ id: 'student-2', display_name: 'Мария', role: 'student', enrollments: [] }],
    meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<CuratorStudentsPage />)

  expect(await screen.findByText('Нет данных')).toBeTruthy()
  expect(screen.getByText('Курс не назначен')).toBeTruthy()
  expect(screen.queryByText('В графике')).toBeNull()
})
