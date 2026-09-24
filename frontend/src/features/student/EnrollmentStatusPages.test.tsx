import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api'
import type { StudentCourse, StudentEnrollment } from '../../api/types'
import { StudentCoursePage } from './StudentCoursePage'
import { StudentCoursesPage } from './StudentCoursesPage'

const course: StudentCourse = {
  id: 'enrollment-1', course_id: 'course-1', version: 1, title: 'Основы Python', description: 'Описание',
  status: 'paused', assigned_at: '2026-09-24T00:00:00Z',
  progress: {
    completed_steps: 0, total_steps: 1, earned_points: 0, available_points: 5,
    completion_percent: 0, rating_percent: 0, next_step_id: 'step-1', next_action: 'complete_step',
  },
}

afterEach(() => vi.restoreAllMocks())

it('explains a paused enrollment in the course list', async () => {
  vi.spyOn(api.student, 'courses').mockResolvedValue({
    data: [course], meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<MemoryRouter><StudentCoursesPage /></MemoryRouter>)

  expect(await screen.findByText(/Назначение приостановлено/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Открыть курс' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Продолжить' })).toBeNull()
})

it('explains a completed enrollment on the course overview', async () => {
  const enrollment: StudentEnrollment = {
    ...course, status: 'completed', course_revision_id: 'revision-1', steps: [], progress: { ...course.progress, steps: [] },
  }
  vi.spyOn(api.student, 'enrollment').mockResolvedValue(enrollment)
  render(<MemoryRouter initialEntries={['/student/courses/enrollment-1']}><Routes>
    <Route path="/student/courses/:enrollmentId" element={<StudentCoursePage />} />
  </Routes></MemoryRouter>)

  expect(await screen.findByText(/Назначение завершено/)).toBeTruthy()
  expect(screen.getByText(/новые сдачи недоступны/)).toBeTruthy()
})
