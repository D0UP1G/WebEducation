import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api } from '../../api'
import type { Submission } from '../../api/types'
import { CuratorReviewPage } from './CuratorReviewPage'

const submission: Submission = {
  id: 'attempt-1', step_id: 'step-1', status: 'pending_review', attempt_number: 2,
  score: null, max_score: 10, feedback: null, created_at: '2026-09-23T00:00:00Z',
  student: { id: 'student-1', role: 'student', display_name: 'Иван' },
  artifact_url: 'https://example.com/project',
}

beforeEach(() => {
  vi.spyOn(api.curator, 'submission').mockResolvedValue(submission)
  vi.spyOn(api.curator, 'review').mockResolvedValue({ ...submission, status: 'returned' })
})
afterEach(() => vi.restoreAllMocks())

it('requires a comment before returning a submission', async () => {
  const user = userEvent.setup()
  render(<MemoryRouter initialEntries={['/curator/submissions/attempt-1']}><Routes>
    <Route path="/curator/submissions/:submissionId" element={<CuratorReviewPage />} />
  </Routes></MemoryRouter>)
  await screen.findByText('Иван', { exact: false })
  await user.selectOptions(screen.getByRole('combobox', { name: 'Действие' }), 'returned')
  const button = screen.getByRole('button', { name: 'Отправить решение' })
  expect(button.hasAttribute('disabled')).toBe(true)
  await user.type(screen.getByRole('textbox', { name: 'Комментарий' }), 'Доработай проект')
  await user.click(button)
  await waitFor(() => expect(api.curator.review).toHaveBeenCalledWith('attempt-1', 'returned', 'Доработай проект'))
})
