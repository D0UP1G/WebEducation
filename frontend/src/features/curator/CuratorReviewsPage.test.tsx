import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { api } from '../../api'
import { CuratorReviewsPage } from './CuratorReviewsPage'

afterEach(() => vi.restoreAllMocks())

it('renders the real review queue as a table with working links', async () => {
  vi.spyOn(api.curator, 'reviews').mockResolvedValue({
    data: [{
      submission_id: 'submission-1',
      student: { id: 'student-1', display_name: 'Маша', role: 'student' },
      step: { id: 'step-1', position: 1, schema_version: 1, title: 'Проект', type_key: 'artifact.project', content: {}, max_score: 10 },
      course_title: 'Алгоритмика',
      status: 'pending_review',
      created_at: '2026-09-24T12:00:00Z',
    }],
    meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<MemoryRouter><CuratorReviewsPage /></MemoryRouter>)

  expect(await screen.findByRole('table')).toBeTruthy()
  expect(screen.getByText('Маша')).toBeTruthy()
  expect(screen.getByText('Проект')).toBeTruthy()
  expect(screen.getByText('На проверке')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Открыть' }).getAttribute('href')).toBe('/curator/submissions/submission-1')
})
