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

it('highlights the next step and explains where the course points came from', async () => {
  const enrollment: StudentEnrollment = {
    ...course, status: 'active', course_revision_id: 'revision-1',
    steps: [
      { id: 'theory', title: 'Прочитать тему', type_key: 'theory', schema_version: 1, position: 1, content: { body: 'Текст' }, max_score: 1 },
      { id: 'quiz', title: 'Ответить на вопрос', type_key: 'quiz.single_choice', schema_version: 1, position: 2, content: { question: 'Вопрос' }, max_score: 3 },
      { id: 'project', title: 'Сдать проект', type_key: 'artifact.scratch', schema_version: 1, position: 3, content: { instructions: 'Проект' }, max_score: 5 },
    ],
    progress: {
      completed_steps: 2, total_steps: 3, earned_points: 4, available_points: 9,
      completion_percent: 67, rating_percent: 44, next_step_id: 'project', next_action: 'complete_step',
      steps: [
        { step_id: 'theory', title: 'Прочитать тему', status: 'accepted', earned_points: 1, max_points: 1 },
        { step_id: 'quiz', title: 'Ответить на вопрос', status: 'accepted', earned_points: 3, max_points: 3 },
        { step_id: 'project', title: 'Сдать проект', status: 'not_started', earned_points: 0, max_points: 5 },
      ],
    },
  }
  vi.spyOn(api.student, 'enrollment').mockResolvedValue(enrollment)
  render(<MemoryRouter initialEntries={['/student/courses/enrollment-1']}><Routes>
    <Route path="/student/courses/:enrollmentId" element={<StudentCoursePage />} />
  </Routes></MemoryRouter>)

  expect(await screen.findByRole('region', { name: 'Следующий шаг' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Продолжить →' }).getAttribute('href')).toBe('/student/courses/enrollment-1/steps/project')
  expect(screen.getByText('Теория').parentElement?.textContent).toContain('1 балл')
  expect(screen.getByText('Автопроверка').parentElement?.textContent).toContain('3 балла')
  expect(screen.getByText('Принято куратором').parentElement?.textContent).toContain('0 баллов')
  expect(screen.getByText('проверено тестами')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Сдать проект' }).getAttribute('aria-current')).toBe('step')
})

it('shows the featured course route on the student home page', async () => {
  const activeCourse: StudentCourse = {
    ...course, status: 'active',
    progress: { ...course.progress, next_step_id: 'step-1' },
  }
  vi.spyOn(api.student, 'courses').mockResolvedValue({
    data: [activeCourse], meta: { page: 1, page_size: 20, total: 1 },
  })
  vi.spyOn(api.student, 'enrollment').mockResolvedValue({
    ...activeCourse, course_revision_id: 'revision-1',
    steps: [{ id: 'step-1', title: 'Первый шаг', type_key: 'theory', schema_version: 1, position: 1, content: { body: 'Текст' }, max_score: 5 }],
    progress: { ...activeCourse.progress, steps: [{ step_id: 'step-1', title: 'Первый шаг', status: 'not_started', earned_points: 0, max_points: 5 }] },
  })
  render(<MemoryRouter><StudentCoursesPage /></MemoryRouter>)

  expect(await screen.findByRole('region', { name: 'Следующий шаг' })).toBeTruthy()
  expect(await screen.findByRole('heading', { name: 'Первый шаг' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Продолжить →' }).getAttribute('href')).toBe('/student/courses/enrollment-1/steps/step-1')
  expect(screen.getByRole('link', { name: 'Первый шаг' }).getAttribute('aria-current')).toBe('step')
})
