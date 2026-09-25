import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../api'
import { AdminAssignmentsPage } from './AdminAssignmentsPage'

afterEach(() => vi.restoreAllMocks())

it('shows an unpublished course and explains how to make it assignable', async () => {
  vi.spyOn(api.admin, 'allCourses').mockResolvedValue([
    { id: 'draft-1', title: 'asd', description: '', grade_min: 1, grade_max: 9, latest_version: null, draft_steps_count: 0 },
    { id: 'published-1', title: 'Готовый курс', description: '', grade_min: 1, grade_max: 9, latest_version: 1, draft_steps_count: 2 },
  ])
  vi.spyOn(api.admin, 'users').mockResolvedValue([])
  vi.spyOn(api.admin, 'allEnrollments').mockResolvedValue([])

  render(<MemoryRouter><AdminAssignmentsPage /></MemoryRouter>)

  const draft = await screen.findByRole('option', { name: 'asd · сначала опубликуйте' })
  expect(draft.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText(/добавьте теорию и контрольный вопрос/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'asd' }).getAttribute('href')).toBe('/admin/courses/draft-1/edit')
})

it('lists active students without courses and filters them by student name', async () => {
  vi.spyOn(api.admin, 'allCourses').mockResolvedValue([])
  vi.spyOn(api.admin, 'users').mockResolvedValue([
    { id: 'student-a', display_name: 'Анна', role: 'student' },
    { id: 'student-b', display_name: 'Иван', role: 'student' },
  ])
  vi.spyOn(api.admin, 'allEnrollments').mockResolvedValue([])

  render(<MemoryRouter><AdminAssignmentsPage /></MemoryRouter>)

  expect(await screen.findByRole('heading', { name: 'Иван' })).toBeTruthy()
  expect(screen.getAllByText('Курсы пока не назначены.')).toHaveLength(2)
  fireEvent.change(screen.getByLabelText('Поиск ученика'), { target: { value: 'Анна' } })
  expect(screen.getByRole('heading', { name: 'Анна' })).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Иван' })).toBeNull()
})
