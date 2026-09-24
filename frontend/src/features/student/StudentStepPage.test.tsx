import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api'
import type { Progress, Step, StudentEnrollment } from '../../api/types'
import { StudentStepPage } from './StudentStepPage'

vi.mock('./QuestionsPanel', () => ({ QuestionsPanel: () => null }))

const step: Step = {
  id: 'step-1', type_key: 'theory', schema_version: 1, position: 1,
  title: 'Первый шаг', content: { body: 'Материал' }, max_score: 5,
}

function progress(status: Progress['steps'][number]['status'], nextStepId: string | null): Progress {
  return {
    completed_steps: status === 'accepted' ? 1 : 0, total_steps: 2,
    earned_points: status === 'accepted' ? 5 : 0, available_points: 10,
    completion_percent: status === 'accepted' ? 50 : 0, rating_percent: status === 'accepted' ? 50 : 0,
    next_step_id: nextStepId, next_action: nextStepId ? 'complete_step' : 'course_complete',
    steps: [{ step_id: step.id, title: step.title, status, earned_points: 0, max_points: 5 }],
  }
}

function enrollment(status: StudentEnrollment['status'], currentProgress: Progress): StudentEnrollment {
  return {
    id: 'enrollment-1', course_id: 'course-1', course_revision_id: 'revision-1',
    title: 'Курс', description: '', version: 1, status,
    assigned_at: '2026-09-24T00:00:00Z', steps: [step], progress: currentProgress,
  }
}

function mockResources(status: StudentEnrollment['status'], currentProgress: Progress) {
  vi.spyOn(api.student, 'step').mockResolvedValue(step)
  vi.spyOn(api.student, 'enrollment').mockResolvedValue(enrollment(status, currentProgress))
}

beforeEach(() => {
  vi.spyOn(api.student, 'submissions').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
})
afterEach(() => vi.restoreAllMocks())

function mount() {
  return render(<MemoryRouter initialEntries={['/student/courses/enrollment-1/steps/step-1']}><Routes>
    <Route path="/student/courses/:enrollmentId/steps/:stepId" element={<StudentStepPage />} />
  </Routes></MemoryRouter>)
}

it('offers a direct link to the next step after this one is accepted', async () => {
  mockResources('active', progress('accepted', 'step-2'))
  mount()

  const nextStepLink = await screen.findByRole('link', { name: 'Перейти к следующему шагу' })
  expect(nextStepLink.getAttribute('href')).toBe('/student/courses/enrollment-1/steps/step-2')
})

it('does not offer a next-step link before acceptance', async () => {
  mockResources('active', progress('incorrect', 'step-1'))
  mount()

  await screen.findByText('Ответ неверный')
  expect(screen.queryByRole('link', { name: 'Перейти к следующему шагу' })).toBeNull()
})

it.each([
  ['paused', 'Назначение приостановлено'],
  ['completed', 'Назначение завершено'],
] as const)('explains %s enrollment and blocks submission', async (status, message) => {
  mockResources(status, progress('not_started', 'step-1'))
  const submit = vi.spyOn(api.student, 'submit')
  mount()

  expect(await screen.findByText(new RegExp(message))).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Прочитал' })
  expect(button.hasAttribute('disabled')).toBe(true)
  await userEvent.setup().click(button)
  expect(submit).not.toHaveBeenCalled()
})

it('allows submission for an active enrollment', async () => {
  mockResources('active', progress('not_started', 'step-1'))
  mount()

  const button = await screen.findByRole('button', { name: 'Прочитал' })
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false))
  expect(screen.queryByText(/Назначение приостановлено|Назначение завершено/)).toBeNull()
})

it('keeps submission blocked if enrollment status cannot be loaded', async () => {
  vi.spyOn(api.student, 'step').mockResolvedValue(step)
  vi.spyOn(api.student, 'enrollment').mockRejectedValue(new Error('Нет связи'))
  mount()

  expect(await screen.findByText('Нет связи')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Прочитал' }).hasAttribute('disabled')).toBe(true)
})
