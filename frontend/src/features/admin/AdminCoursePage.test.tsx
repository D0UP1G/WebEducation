import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api'
import type { Course } from '../../api/types'
import { AdminCoursePage } from './AdminCoursePage'

const course: Course = {
  id: 'course-1', title: 'Основы Python', description: 'Курс для проверки',
  grade_min: 5, grade_max: 8, latest_version: 2, updated_at: '2026-09-24T00:00:00Z', draft_steps: [],
}

afterEach(() => vi.restoreAllMocks())

function mount() {
  return render(<MemoryRouter initialEntries={['/admin/courses/course-1/edit']}><Routes>
    <Route path="/admin/courses/:courseId/edit" element={<AdminCoursePage />} />
  </Routes></MemoryRouter>)
}

function mockCourseApi() {
  vi.spyOn(api.admin, 'course').mockResolvedValue(course)
  vi.spyOn(api.admin, 'types').mockResolvedValue([])
  vi.spyOn(api.admin, 'publish').mockResolvedValue({
    id: 'revision-3', version: 3, title: course.title, description: course.description,
    grade_min: course.grade_min, grade_max: course.grade_max, steps: [], published_at: '2026-09-24T00:00:00Z',
  })
}

it('does not publish when the administrator cancels confirmation', async () => {
  mockCourseApi()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const user = userEvent.setup()
  mount()

  await screen.findByRole('heading', { name: course.title })
  await user.click(screen.getByRole('button', { name: 'Опубликовать новую версию' }))

  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('версию 3'))
  expect(api.admin.publish).not.toHaveBeenCalled()
})

it('publishes after confirmation and explains that existing enrollments stay on their revision', async () => {
  mockCourseApi()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  const user = userEvent.setup()
  mount()

  await screen.findByRole('heading', { name: course.title })
  await user.click(screen.getByRole('button', { name: 'Опубликовать новую версию' }))

  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('останутся на своей версии'))
  await waitFor(() => expect(api.admin.publish).toHaveBeenCalledWith(course.id))
})
