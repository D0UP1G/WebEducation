import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../api'
import type { StudentCourse } from '../../api/types'
import { StudentProfilePage } from './StudentProfilePage'

afterEach(() => vi.restoreAllMocks())

it('summarizes only progress and points returned for the student courses', async () => {
  const courses: StudentCourse[] = [
    {
      id: 'enrollment-1', course_id: 'course-1', version: 1, title: 'Алгоритмика', description: '',
      status: 'active', assigned_at: '2026-09-25T00:00:00Z',
      progress: { completed_steps: 2, total_steps: 5, earned_points: 2, available_points: 5, completion_percent: 40, rating_percent: 40, next_step_id: 'step-3', next_action: 'complete_step' },
    },
    {
      id: 'enrollment-2', course_id: 'course-2', version: 1, title: 'Python', description: '',
      status: 'active', assigned_at: '2026-09-25T00:00:00Z',
      progress: { completed_steps: 1, total_steps: 3, earned_points: 1, available_points: 3, completion_percent: 33, rating_percent: 33, next_step_id: 'step-2', next_action: 'complete_step' },
    },
  ]
  vi.spyOn(api.student, 'allCourses').mockResolvedValue(courses)
  render(<MemoryRouter><StudentProfilePage /></MemoryRouter>)

  expect(await screen.findByText('Выполнение курсов')).toBeTruthy()
  expect(screen.getByText('Баллы').parentElement?.textContent).toContain('3 из 8')
  expect(screen.getByText('2', { selector: '.profile-stats strong' })).toBeTruthy()
  expect(screen.getByText('3', { selector: '.profile-stats strong' })).toBeTruthy()
  expect(screen.getByRole('link', { name: /Алгоритмика/ }).getAttribute('href')).toBe('/student/courses/enrollment-1')
})
