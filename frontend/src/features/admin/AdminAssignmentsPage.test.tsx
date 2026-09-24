import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  vi.spyOn(api.admin, 'enrollments').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })

  render(<MemoryRouter><AdminAssignmentsPage /></MemoryRouter>)

  const draft = await screen.findByRole('option', { name: 'asd · сначала опубликуйте' })
  expect(draft.hasAttribute('disabled')).toBe(true)
  expect(screen.getByText(/добавьте шаг «Теория»/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'asd' }).getAttribute('href')).toBe('/admin/courses/draft-1/edit')
})
