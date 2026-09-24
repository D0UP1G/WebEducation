import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api'
import type { Progress, Step } from '../../api/types'
import { StudentStepPage } from './StudentStepPage'

vi.mock('./SubmissionPanel', () => ({ SubmissionPanel: () => null }))
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

afterEach(() => vi.restoreAllMocks())

function mount() {
  return render(<MemoryRouter initialEntries={['/student/courses/enrollment-1/steps/step-1']}><Routes>
    <Route path="/student/courses/:enrollmentId/steps/:stepId" element={<StudentStepPage />} />
  </Routes></MemoryRouter>)
}

it('offers a direct link to the next step after this one is accepted', async () => {
  vi.spyOn(api.student, 'step').mockResolvedValue(step)
  vi.spyOn(api.student, 'progress').mockResolvedValue(progress('accepted', 'step-2'))
  mount()

  const nextStepLink = await screen.findByRole('link', { name: 'Перейти к следующему шагу' })
  expect(nextStepLink.getAttribute('href')).toBe('/student/courses/enrollment-1/steps/step-2')
})

it('does not offer a next-step link before acceptance', async () => {
  vi.spyOn(api.student, 'step').mockResolvedValue(step)
  vi.spyOn(api.student, 'progress').mockResolvedValue(progress('incorrect', 'step-1'))
  mount()

  await screen.findByRole('heading', { name: step.title })
  expect(screen.queryByRole('link', { name: 'Перейти к следующему шагу' })).toBeNull()
})
