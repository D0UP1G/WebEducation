import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../../api'
import { QuestionsPanel } from './QuestionsPanel'

afterEach(() => vi.restoreAllMocks())

it('keeps the curator question as a conversation and lets the student reply', async () => {
  const question = {
    id: 'q1', question: 'Как решить?', answer: '', created_at: '2026-09-24T00:00:00Z',
    messages: [{
      id: 'm1', sender: { id: 'c1', display_name: 'Ольга', role: 'curator' as const },
      body: 'Начни с примера 2 + 2.', created_at: '2026-09-24T00:00:00Z',
    }],
  }
  const answeredQuestion = { ...question, messages: [...question.messages, {
    id: 'm2', sender: { id: 's1', display_name: 'Иван', role: 'student' as const },
    body: 'Спасибо, получилось', created_at: '2026-09-24T00:01:00Z',
  }] }
  vi.spyOn(api.student, 'questions')
    .mockResolvedValueOnce({ data: [question], meta: { page: 1, page_size: 20, total: 1 } })
    .mockResolvedValue({ data: [answeredQuestion], meta: { page: 1, page_size: 20, total: 1 } })
  const reply = vi.spyOn(api.student, 'reply').mockResolvedValue(answeredQuestion)
  const user = userEvent.setup()
  render(<QuestionsPanel enrollmentId="e1" stepId="s1" />)

  expect(await screen.findByText('Начни с примера 2 + 2.')).toBeTruthy()
  expect(screen.queryByText('Ответ ещё не получен')).toBeNull()
  await user.type(screen.getByRole('textbox', { name: 'Ответить' }), 'Спасибо, получилось')
  await user.click(screen.getByRole('button', { name: 'Отправить сообщение' }))

  await waitFor(() => expect(reply).toHaveBeenCalledWith('q1', 'Спасибо, получилось'))
  expect(await screen.findByText('Спасибо, получилось')).toBeTruthy()
})
