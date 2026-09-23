import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../../api'
import type { Step, StepType, Submission } from '../../api/types'
import { SubmissionPanel } from './SubmissionPanel'

const result: Submission = {
  id: 'attempt-1', step_id: 'step-1', status: 'accepted', attempt_number: 1,
  score: 5, max_score: 5, feedback: null, created_at: '2026-09-23T00:00:00Z',
}

function step(type_key: StepType): Step {
  return {
    id: 'step-1', type_key, schema_version: 1, title: 'Задание', position: 1, max_score: 5,
    content: { choices: [{ id: 'a', text: 'Первый' }, { id: 'b', text: 'Второй' }] },
  }
}

beforeEach(() => {
  vi.spyOn(api.student, 'submissions').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  vi.spyOn(api.student, 'submit').mockResolvedValue(result)
})
afterEach(() => vi.restoreAllMocks())

async function submitStep(type: StepType, fill?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  const user = userEvent.setup()
  const onUpdated = vi.fn()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step(type)} accepted={false} onUpdated={onUpdated} />)
  if (fill) await fill(user)
  await user.click(screen.getByRole('button', { name: type === 'theory' ? 'Прочитал' : 'Отправить на проверку' }))
  await waitFor(() => expect(api.student.submit).toHaveBeenCalledTimes(1))
  expect(onUpdated).toHaveBeenCalled()
  return vi.mocked(api.student.submit).mock.calls[0]
}

it('completes a theory step', async () => {
  const call = await submitStep('theory')
  expect(call.slice(0, 3)).toEqual(['enrollment-1', 'step-1', { action: 'complete' }])
  expect(typeof call[3]).toBe('string')
})

it('submits the selected quiz option', async () => {
  const call = await submitStep('quiz.single_choice', async (user) => {
    await user.click(screen.getByRole('radio', { name: 'Первый' }))
  })
  expect(call[2]).toEqual({ answer: 'a' })
})

it('submits an exact answer', async () => {
  const call = await submitStep('answer.exact', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Ваш ответ' }), ' 42 ')
  })
  expect(call[2]).toEqual({ answer: '42' })
})

it('submits Python code', async () => {
  const call = await submitStep('algorithm.python', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Код Python' }), 'print(42)')
  })
  expect(call[2]).toEqual({ code: 'print(42)' })
})

it.each<StepType>(['artifact.scratch', 'artifact.minecraft'])('submits a %s link', async (type) => {
  const call = await submitStep(type, async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Ссылка' }), 'https://example.com/project')
  })
  expect(call[2]).toEqual({ url: 'https://example.com/project' })
})

it('submits an artifact file as multipart data', async () => {
  const file = new File(['demo'], 'project.sb3', { type: 'application/octet-stream' })
  const call = await submitStep('artifact.scratch', async (user) => {
    await user.upload(screen.getByLabelText('Файл'), file)
  })
  expect(call[2]).toBeInstanceOf(FormData)
  expect((call[2] as FormData).get('file')).toBe(file)
})

it('locks an already accepted step', async () => {
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('theory')} accepted onUpdated={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Прочитал' })).toBeNull()
})

it('waits for progress before allowing a new submission', async () => {
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('theory')} accepted={false} disabled onUpdated={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Прочитал' }).hasAttribute('disabled')).toBe(true)
})
