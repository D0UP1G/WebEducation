import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  localStorage.clear()
  vi.spyOn(api.student, 'submissions').mockResolvedValue({ data: [], meta: { page: 1, page_size: 20, total: 0 } })
  vi.spyOn(api.student, 'submit').mockResolvedValue(result)
  vi.spyOn(api.student, 'pythonSample').mockResolvedValue({
    sample: { input: '1 2\n', output: '3\n' },
    limits: { time_limit_ms: 1000, memory_limit_mb: 128, output_limit_bytes: 65536 },
  })
  vi.spyOn(pythonRunner, 'runPythonSample').mockResolvedValue(
    { stdout: '3\n', stderr: '', exit_code: 0, duration_ms: 20, peak_memory_bytes: 1000 },
  )
  vi.spyOn(pythonRunner, 'runPythonTrace').mockResolvedValue({
    stdout: '3\n', stderr: '', exit_code: 0, duration_ms: 35, peak_memory_bytes: 1000,
    trace_steps: [
      { kind: 'line', line: 1, scope: '<module>', stack: ['<module>'], variables: {}, stdout: '' },
      { kind: 'line', line: 2, scope: '<module>', stack: ['<module>'], variables: { total: '3' }, stdout: '' },
      { kind: 'finish', line: 2, scope: '<module>', stack: ['<module>'], variables: { total: '3' }, stdout: '3\n' },
    ],
  })
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

async function setPythonCode(code: string) {
  const editor = await screen.findByRole('textbox', { name: 'Код Python' })
  editor.textContent = code
  fireEvent.input(editor, { inputType: 'insertText', data: code })
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

it.each<StepType>(['answer.exact', 'scratch.numeric_answer'])('submits a %s answer', async (type) => {
  const call = await submitStep(type, async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Твой ответ' }), ' 42 ')
  })
  expect(call[2]).toEqual({ answer: '42' })
})

it('submits Python code', async () => {
  const call = await submitStep('algorithm.python', async () => { await setPythonCode('print(42)') })
  expect(api.student.pythonSample).not.toHaveBeenCalled()
  expect(pythonRunner.runPythonSample).not.toHaveBeenCalled()
  expect(call[2]).toEqual({ code: 'print(42)' })
})

it('runs Python self-check without creating a submission or awarding points', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print(42)')
  await user.click(screen.getByRole('button', { name: 'Проверить тестовый пример' }))
  await screen.findByText(/Открытый пример: верно/)
  expect(screen.getByText(/Итоговый зачёт определяется только сервером/)).toBeTruthy()
  expect(api.student.pythonSample).toHaveBeenCalledTimes(1)
  expect(pythonRunner.runPythonSample).toHaveBeenCalledTimes(1)
  expect(api.student.submit).not.toHaveBeenCalled()
})

it('shows a wrong answer and the actual output in local Python self-check', async () => {
  vi.mocked(pythonRunner.runPythonSample).mockResolvedValueOnce(
    { stdout: '4\n', stderr: '', exit_code: 0, duration_ms: 15, peak_memory_bytes: 1000 },
  )
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print(4)')
  await user.click(screen.getByRole('button', { name: 'Проверить тестовый пример' }))
  await screen.findByText(/Открытый пример: ответ отличается от ожидаемого/)
  expect(screen.getByRole('status').querySelectorAll('pre')[2].textContent).toBe('4\n')
  expect(api.student.submit).not.toHaveBeenCalled()
})

it('runs custom Python input and displays output without judging correctness', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print(input())')
  await user.type(screen.getByRole('textbox', { name: 'Входные данные для тестового примера' }), 'custom input')
  await user.click(screen.getByRole('button', { name: 'Проверить тестовый пример' }))

  expect(await screen.findByText(/Результат запуска/)).toBeTruthy()
  expect(screen.queryByText(/ответ отличается|верно на открытом примере/)).toBeNull()
  expect(screen.queryByText('Ожидаемый вывод открытого примера:')).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('custom input')
  expect(pythonRunner.runPythonSample).toHaveBeenCalledWith('print(input())', expect.anything(), 'custom input')
  expect(api.student.submit).not.toHaveBeenCalled()
})

it('visualizes Python execution locally and navigates through variable and output snapshots', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('total = 1 + 2\nprint(total)')
  await user.click(screen.getByRole('button', { name: 'Показать выполнение по шагам' }))

  const viewer = await screen.findByRole('region', { name: 'Выполнение Python по шагам' })
  expect(viewer.textContent).toContain('Перед выполнением строки 1')
  expect(viewer.querySelector('[aria-current="step"]')?.textContent).toContain('total = 1 + 2')
  await user.click(screen.getByRole('button', { name: 'Далее →' }))
  expect(viewer.textContent).toContain('total')
  expect(viewer.textContent).toContain('3')
  expect(viewer.querySelector('[aria-current="step"]')?.textContent).toContain('print(total)')
  await user.click(screen.getByRole('button', { name: 'Далее →' }))
  expect(viewer.textContent).toContain('Программа завершилась')
  expect(viewer.textContent).toContain('3\n')
  expect(api.student.pythonSample).toHaveBeenCalledTimes(1)
  expect(pythonRunner.runPythonTrace).toHaveBeenCalledWith('total = 1 + 2\nprint(total)', expect.anything(), '1 2\n')
  expect(api.student.submit).not.toHaveBeenCalled()
})

it('clears visualization when Python input changes', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print(input())')
  await user.click(screen.getByRole('button', { name: 'Показать выполнение по шагам' }))
  await screen.findByRole('region', { name: 'Выполнение Python по шагам' })
  await user.type(screen.getByRole('textbox', { name: 'Входные данные для тестового примера' }), 'custom')
  expect(screen.queryByRole('region', { name: 'Выполнение Python по шагам' })).toBeNull()
})

it('clears self-check after Python submission and explains the checked result', async () => {
  vi.mocked(api.student.submit).mockResolvedValue({
    ...result, status: 'incorrect', score: 0, feedback: 'Тесты не пройдены',
    safe_diagnostics: { passed_tests: 0, total_tests: 2, reason: 'wrong_answer' },
  })
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  expect(screen.getByRole('button', { name: 'Отправить на проверку' }).hasAttribute('disabled')).toBe(true)
  await setPythonCode('print(42)')
  await user.click(screen.getByRole('button', { name: 'Проверить тестовый пример' }))
  await screen.findByText(/Открытый пример: верно/)
  await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }))
  await screen.findByText(/Пройдено 0 из 2 тестов. Причина: неверный ответ/)
  expect(screen.queryByText(/Открытый пример: верно/)).toBeNull()
})

it('clears the local Python result when the code changes', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print(42)')
  await user.click(screen.getByRole('button', { name: 'Проверить тестовый пример' }))
  await screen.findByText(/Открытый пример: верно/)
  await setPythonCode('print(43)')
  await waitFor(() => expect(screen.queryByText(/Открытый пример: верно/)).toBeNull())
})

it('restores a Python draft after leaving and reopening the step', async () => {
  const firstVisit = render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  await setPythonCode('print("draft")')
  await waitFor(() => expect(localStorage.getItem('webeducation:python-draft:enrollment-1:step-1')).toBe('print("draft")'))
  firstVisit.unmount()

  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted={false} onUpdated={vi.fn()} />)
  expect((await screen.findByRole('textbox', { name: 'Код Python' })).textContent).toContain('print("draft")')
})

it('loads the correct saved draft when moving between steps without remounting', async () => {
  localStorage.setItem('webeducation:python-draft:enrollment-1:step-1', 'print("first")')
  localStorage.setItem('webeducation:python-draft:enrollment-1:step-2', 'print("second")')
  const first = step('algorithm.python')
  const view = render(<SubmissionPanel enrollmentId="enrollment-1" step={first} accepted={false} onUpdated={vi.fn()} />)
  expect((await screen.findByRole('textbox', { name: 'Код Python' })).textContent).toContain('print("first")')

  const second = { ...first, id: 'step-2', position: 2 }
  view.rerender(<SubmissionPanel enrollmentId="enrollment-1" step={second} accepted={false} onUpdated={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Код Python' }).textContent).toContain('print("second")'))
  expect(localStorage.getItem('webeducation:python-draft:enrollment-1:step-2')).toBe('print("second")')
})

it.each<StepType>(['artifact.scratch', 'artifact.minecraft', 'artifact.project'])('submits a %s link', async (type) => {
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

it('submits file, link and explanation together for a manual project', async () => {
  const file = new File(['image'], 'world.png', { type: 'image/png' })
  const call = await submitStep('artifact.minecraft', async (user) => {
    await user.upload(screen.getByLabelText('Файл'), file)
    await user.type(screen.getByRole('textbox', { name: 'Ссылка' }), 'https://example.com/world')
    await user.type(screen.getByRole('textbox', { name: 'Пояснение' }), '  На снимке готовый мост  ')
  })
  const body = call[2] as FormData
  expect(body.get('file')).toBe(file)
  expect(body.get('url')).toBe('https://example.com/world')
  expect(body.get('explanation')).toBe('На снимке готовый мост')
})

it('shows required evidence and blocks an incomplete manual submission', async () => {
  const user = userEvent.setup()
  const manualStep = step('artifact.minecraft')
  manualStep.content.required_evidence = ['file', 'url', 'explanation']
  render(<SubmissionPanel enrollmentId="enrollment-1" step={manualStep} accepted={false} onUpdated={vi.fn()} />)
  const submit = screen.getByRole('button', { name: 'Отправить на проверку' })
  expect(screen.getByText(/добавь в одной попытке: файл, ссылка, пояснение/)).toBeTruthy()
  await user.type(screen.getByRole('textbox', { name: /Ссылка/ }), 'https://example.com/world')
  expect(submit.hasAttribute('disabled')).toBe(true)
  await user.type(screen.getByRole('textbox', { name: /Пояснение/ }), 'Мост готов')
  expect(submit.hasAttribute('disabled')).toBe(true)
  await user.upload(screen.getByLabelText(/Файл/), new File(['image'], 'bridge.png', { type: 'image/png' }))
  expect(submit.hasAttribute('disabled')).toBe(false)
  await user.click(submit)
  await waitFor(() => expect(api.student.submit).toHaveBeenCalledTimes(1))
})

it('does not submit an explanation without a file or link', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('artifact.minecraft')} accepted={false} onUpdated={vi.fn()} />)
  await user.type(screen.getByRole('textbox', { name: 'Пояснение' }), 'Только текст')
  expect(screen.getByRole('button', { name: 'Отправить на проверку' }).hasAttribute('disabled')).toBe(true)
  expect(api.student.submit).not.toHaveBeenCalled()
})

it('locks an already accepted step', async () => {
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('theory')} accepted onUpdated={vi.fn()} />)
  expect(screen.queryByRole('button', { name: 'Прочитал' })).toBeNull()
})

it('allows another server-checked Python variant after acceptance', async () => {
  const user = userEvent.setup()
  render(<SubmissionPanel enrollmentId="enrollment-1" step={step('algorithm.python')} accepted onUpdated={vi.fn()} />)

  const editor = await screen.findByRole('textbox', { name: 'Код Python' })
  expect(editor.getAttribute('contenteditable')).toBe('true')
  expect(screen.getByText(/предыдущий зачёт и баллы сохранятся/)).toBeTruthy()
  await setPythonCode('print(42)')
  await user.click(screen.getByRole('button', { name: 'Отправить на проверку' }))

  await waitFor(() => expect(api.student.submit).toHaveBeenCalledTimes(1))
  expect(api.student.submit).toHaveBeenCalledWith('enrollment-1', 'step-1', { code: 'print(42)' }, expect.any(String))
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
