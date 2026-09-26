import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { api } from '../../api'
import { CourseRatingPanel } from './CourseRatingPanel'

afterEach(() => vi.restoreAllMocks())

it('explains rating changes and shows the course top and recent reasons', async () => {
  vi.spyOn(api.student, 'rating').mockResolvedValue({
    rating: 170,
    place: 2,
    participant_count: 4,
    top: [
      { place: 1, display_name: 'Ученик Б', rating: 200, is_current_user: false },
      { place: 2, display_name: 'Ученик А', rating: 170, is_current_user: true },
    ],
    recent_changes: [{
      id: 'attempt-1', step_id: 'step-1', step_title: 'Проверочный вопрос',
      attempt_number: 2, status: 'incorrect', delta: -10,
      reason: 'Неверная попытка до зачёта', created_at: '2026-09-26T12:00:00Z',
    }],
    total_changes: 1,
    award_per_score_point: 100,
    wrong_attempt_penalty: 10,
  })

  render(<CourseRatingPanel enrollmentId="enrollment-1" />)

  expect((await screen.findAllByText('170')).length).toBe(2)
  expect(screen.getByText('Место 2 из 4')).toBeTruthy()
  expect(screen.getByText('Ученик Б')).toBeTruthy()
  expect(screen.getByText('Неверная попытка до зачёта · попытка №2')).toBeTruthy()
  expect(screen.getByText('−10')).toBeTruthy()
  expect(screen.getByText(/время на решение на рейтинг не влияют/)).toBeTruthy()
})
