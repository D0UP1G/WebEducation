import { afterEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { api } from '../../api'
import { CuratorQuestionsPage } from './CuratorQuestionsPage'

afterEach(() => vi.restoreAllMocks())

it('shows the course and step material next to a student question', async () => {
  vi.spyOn(api.curator, 'questions').mockResolvedValue({
    data: [{
      id: 'question-1', question: 'Что делать дальше?', answer: '', created_at: '2026-09-24T00:00:00Z',
      course_title: 'Первый курс', student: { id: 'student-1', display_name: 'Иван', role: 'student' },
      step: {
        id: 'step-1', title: 'Введение', type_key: 'theory', schema_version: 1,
        position: 1, max_score: 1, content: { body: 'Прочитайте правило' },
      },
    }],
    meta: { page: 1, page_size: 20, total: 1 },
  })

  render(<CuratorQuestionsPage />)
  expect(await screen.findByText('Курс: Первый курс')).toBeTruthy()
  expect(screen.getByText('Прочитайте правило')).toBeTruthy()
  expect(screen.getByText('Иван')).toBeTruthy()
  expect(screen.getByText('Что делать дальше?')).toBeTruthy()
})

it('shows public quiz choices without an answer key', async () => {
  vi.spyOn(api.curator, 'questions').mockResolvedValue({
    data: [{
      id: 'question-2', question: 'Какой выбрать?', answer: '', created_at: '2026-09-24T00:00:00Z',
      step: {
        id: 'step-2', title: 'Вопрос', type_key: 'quiz.single_choice', schema_version: 1,
        position: 2, max_score: 1, content: { question: 'Выберите число', choices: [{ id: 'a', text: 'Один' }, { id: 'b', text: 'Два' }] },
      },
    }],
    meta: { page: 1, page_size: 20, total: 1 },
  })

  render(<CuratorQuestionsPage />)
  expect(await screen.findByText('Выберите число')).toBeTruthy()
  expect(screen.getByText('Один')).toBeTruthy()
  expect(screen.getByText('Два')).toBeTruthy()
})
