import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../../api'
import type { Step, StepType, Submission } from '../../api/types'
import { SubmissionPanel } from './SubmissionPanel'
import * as pythonRunner from './pythonRunner'

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
  vi.spyOn(api.student, 'pythonChallenge').mockResolvedValue({
    challenge_token: 'signed-token', tests: [{ id: 0, input: '1 2\n' }],
    limits: { time_limit_ms: 1000, memory_limit_mb: 128, output_limit_bytes: 65536 },
    expires_in_seconds: 600,
  })
  vi.spyOn(pythonRunner, 'runPythonTests').mockResolvedValue([
    { id: 0, stdout: '3\n', exit_code: 0, duration_ms: 20, peak_memory_bytes: 1000 },
  ])
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

it('submits every selected option for a multiple-choice quiz', async () => {
  const call = await submitStep('quiz.multiple_choice', async (user) => {
    await user.click(screen.getByRole('checkbox', { name: 'Первый' }))
    await user.click(screen.getByRole('checkbox', { name: 'Второй' }))
  })
  expect(call[2]).toEqual({ answer: ['a', 'b'] })
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
  expect(api.student.pythonChallenge).toHaveBeenCalledWith('enrollment-1', 'step-1', 'print(42)')
  expect(call[2]).toEqual({ code: 'print(42)', challenge_token: 'signed-token', results: [
    { id: 0, stdout: '3\n', exit_code: 0, duration_ms: 20, peak_memory_bytes: 1000 },
  ] })
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

it.each<Submission['status']>(['queued', 'checking', 'pending_review'])('blocks another attempt while %s', async (status) => {
  vi.mocked(api.student.submissions).mockResolvedValue({
    data: [{ ...result, status, score: null }], meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('theory')} accepted={false} onUpdated={vi.fn()} />)

  await screen.findByText(/Последняя попытка/)
  expect(screen.getByRole('button', { name: 'Прочитал' }).hasAttribute('disabled')).toBe(true)
})

it.each<Submission['status']>(['incorrect', 'returned', 'error'])('allows a retry after %s', async (status) => {
  vi.mocked(api.student.submissions).mockResolvedValue({
    data: [{ ...result, status, feedback: 'Попробуйте ещё раз' }], meta: { page: 1, page_size: 20, total: 1 },
  })
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('theory')} accepted={false} onUpdated={vi.fn()} />)

  await screen.findByText(/Последняя попытка/)
  expect(screen.getByText('Комментарий: Попробуйте ещё раз')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Прочитал' }).hasAttribute('disabled')).toBe(false)
})
