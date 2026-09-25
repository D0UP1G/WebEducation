import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Step, StepType, StepTypeInfo } from '../../api/types'
import { StepEditorForm } from './StepEditorForm'

const keys: StepType[] = ['theory', 'quiz.single_choice', 'quiz.multiple_choice', 'answer.exact', 'scratch.numeric_answer', 'algorithm.python', 'artifact.scratch', 'artifact.minecraft', 'artifact.project']
const types: StepTypeInfo[] = keys.map((type_key) => ({ type_key, schema_version: 1, title: type_key, checking_mode: 'instant' }))
afterEach(() => vi.restoreAllMocks())

async function edit(type: StepType, fill: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  const user = userEvent.setup()
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<StepEditorForm types={types} position={3} onSave={onSave} onCancel={vi.fn()} />)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Тип шага' }), type)
  await user.type(screen.getByRole('textbox', { name: 'Название' }), 'Новый шаг')
  await fill(user)
  await user.click(screen.getByRole('button', { name: 'Сохранить шаг' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  const payload = onSave.mock.calls[0][0] as Omit<Step, 'id'>
  expect(payload).toMatchObject({ type_key: type, schema_version: 1, position: 3, title: 'Новый шаг', max_score: 5 })
  return payload
}

it('serializes theory material', async () => {
  const payload = await edit('theory', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Текст материала в Markdown' }), 'Текст урока')
  })
  expect(payload.content).toEqual({ body: 'Текст урока' })
})

it('serializes a quiz with its correct option', async () => {
  const payload = await edit('quiz.single_choice', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Контрольный вопрос' }), 'Сколько?')
    await user.type(screen.getByRole('textbox', { name: 'Вариант 1' }), 'Один')
    await user.type(screen.getByRole('textbox', { name: 'Вариант 2' }), 'Два')
    await user.click(screen.getAllByRole('radio', { name: 'Верный' })[1])
  })
  expect(payload.content).toEqual({ question: 'Сколько?', choices: [{ id: 'a', text: 'Один' }, { id: 'b', text: 'Два' }], correct_option_id: 'b' })
})

it('serializes every correct option for a multiple-choice quiz', async () => {
  const payload = await edit('quiz.multiple_choice', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Контрольный вопрос' }), 'Что выбрать?')
    await user.type(screen.getByRole('textbox', { name: 'Вариант 1' }), 'Первый')
    await user.type(screen.getByRole('textbox', { name: 'Вариант 2' }), 'Второй')
    await user.click(screen.getAllByRole('checkbox', { name: 'Верный' })[0])
    await user.click(screen.getAllByRole('checkbox', { name: 'Верный' })[1])
  })
  expect(payload.content).toEqual({
    question: 'Что выбрать?', choices: [{ id: 'a', text: 'Первый' }, { id: 'b', text: 'Второй' }],
    correct_option_ids: ['a', 'b'],
  })
})

it.each<StepType>(['answer.exact', 'scratch.numeric_answer'])('serializes %s answers line by line', async (type) => {
  const payload = await edit(type, async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Формулировка' }), 'Ответ?')
    await user.type(screen.getByRole('textbox', { name: /Допустимые ответы/ }), 'да{enter}конечно')
  })
  expect(payload.content).toEqual({ prompt: 'Ответ?', accepted_answers: ['да', 'конечно'] })
})

it('serializes Python tests and limits', async () => {
  const payload = await edit('algorithm.python', async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Условие' }), 'Сложить')
    await user.type(screen.getByRole('textbox', { name: 'Ввод #1' }), '1 2')
    await user.type(screen.getByRole('textbox', { name: 'Ожидаемый вывод' }), '3')
  })
  expect(payload.content).toEqual({ statement: 'Сложить', tests: [{ input: '1 2', output: '3' }], time_limit_ms: 1000, memory_limit_mb: 128 })
})

it.each<StepType>(['artifact.scratch', 'artifact.minecraft', 'artifact.project'])('serializes %s instructions', async (type) => {
  const payload = await edit(type, async (user) => {
    await user.type(screen.getByRole('textbox', { name: 'Инструкция' }), 'Собери проект')
  })
  expect(payload.content).toEqual({ instructions: 'Собери проект' })
})

it('keeps required evidence and curator criteria when editing an imported manual step', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const initial: Step = {
    id: 'minecraft-1', type_key: 'artifact.minecraft', schema_version: 1, position: 4,
    title: 'Мост', max_score: 1,
    content: {
      instructions: 'Собери мост', required_evidence: ['file', 'url', 'explanation'],
      review_criteria: 'Проверь снимок и ссылку', importer_note: 'сохранить при редактировании',
    },
  }
  render(<StepEditorForm initial={initial} types={types} position={9} onSave={onSave} onCancel={vi.fn()} />)

  expect(screen.getByRole('checkbox', { name: 'Файл' }).hasAttribute('checked')).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Критерии для куратора' })).toHaveProperty('value', 'Проверь снимок и ссылку')
  await user.click(screen.getByRole('button', { name: 'Сохранить шаг' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0].content).toEqual(initial.content)
})

it('keeps the Scratch hint when editing an imported numeric step', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn().mockResolvedValue(undefined)
  const initial: Step = {
    id: 'scratch-1', type_key: 'scratch.numeric_answer', schema_version: 1, position: 3,
    title: 'Мяч', max_score: 1,
    content: { prompt: 'Где мяч?', accepted_answers: ['0'], feedback_after_incorrect: 'Посчитай шаги.' },
  }
  render(<StepEditorForm initial={initial} types={types} position={9} onSave={onSave} onCancel={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Сохранить шаг' }))
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  expect(onSave.mock.calls[0][0].content).toEqual(initial.content)
})
