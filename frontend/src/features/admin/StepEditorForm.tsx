import { useState, type FormEvent } from 'react'
import { ErrorNotice } from '../../components/Feedback'
import type { Choice, Step, StepContent, StepType, StepTypeInfo } from '../../api/types'

const blankChoices: Choice[] = [{ id: 'a', text: '' }, { id: 'b', text: '' }]
const blankTests = [{ input: '', output: '' }]

export function StepEditorForm({ initial, types, position, onSave, onCancel }: {
  initial?: Step
  types: StepTypeInfo[]
  position: number
  onSave: (step: Omit<Step, 'id'>) => Promise<void>
  onCancel: () => void
}) {
  const content = initial?.content
  const [typeKey, setTypeKey] = useState<StepType>(initial?.type_key ?? 'theory')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [maxScore, setMaxScore] = useState(initial?.max_score ?? 5)
  const [body, setBody] = useState(content?.body ?? '')
  const [question, setQuestion] = useState(content?.question ?? '')
  const [choices, setChoices] = useState<Choice[]>(content?.choices?.length ? content.choices : blankChoices)
  const [correct, setCorrect] = useState(content?.correct_option_id ?? '')
  const [prompt, setPrompt] = useState(content?.prompt ?? '')
  const [answers, setAnswers] = useState(content?.accepted_answers?.join('\n') ?? '')
  const [statement, setStatement] = useState(content?.statement ?? '')
  const [tests, setTests] = useState(content?.tests?.length ? content.tests : blankTests)
  const [timeLimit, setTimeLimit] = useState(content?.time_limit_ms ?? 1000)
  const [memoryLimit, setMemoryLimit] = useState(content?.memory_limit_mb ?? 128)
  const [instructions, setInstructions] = useState(content?.instructions ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  function buildContent(): StepContent {
    switch (typeKey) {
      case 'theory': return { body: body.trim() }
      case 'quiz.single_choice': return {
        question: question.trim(),
        choices: choices.map((choice) => ({ id: choice.id, text: choice.text.trim() })),
        correct_option_id: correct,
      }
      case 'answer.exact': return { prompt: prompt.trim(), accepted_answers: answers.split('\n').map((item) => item.trim()).filter(Boolean) }
      case 'algorithm.python': return {
        statement: statement.trim(), tests,
        time_limit_ms: timeLimit, memory_limit_mb: memoryLimit,
      }
      case 'artifact.scratch':
      case 'artifact.minecraft': return { instructions: instructions.trim() }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave({
        type_key: typeKey,
        schema_version: 1,
        position: initial?.position ?? position,
        title: title.trim(),
        content: buildContent(),
        max_score: maxScore,
      })
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="form-stack card">
    <h3>{initial ? 'Изменить шаг' : 'Добавить шаг'}</h3>
    <ErrorNotice error={error} />
    <label>Тип шага<select value={typeKey} onChange={(event) => setTypeKey(event.target.value as StepType)}>
      {types.map((type) => <option key={type.type_key} value={type.type_key}>{type.title}</option>)}
    </select></label>
    <label>Название<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Баллы<input type="number" min={0} value={maxScore} onChange={(event) => setMaxScore(Number(event.target.value))} /></label>

    {typeKey === 'theory' && <label>Текст материала<textarea required rows={8} value={body} onChange={(event) => setBody(event.target.value)} /></label>}
    {typeKey === 'quiz.single_choice' && <>
      <label>Контрольный вопрос<textarea required value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
      <fieldset><legend>Варианты ответа</legend>
        {choices.map((choice, index) => <div className="field-row" key={choice.id}>
          <label>Вариант {index + 1}<input required value={choice.text} onChange={(event) => setChoices((items) => items.map((item) => item.id === choice.id ? { ...item, text: event.target.value } : item))} /></label>
          <label className="inline-label"><input type="radio" name="correct" required checked={correct === choice.id} onChange={() => setCorrect(choice.id)} />Верный</label>
          {choices.length > 2 && <button type="button" onClick={() => { setChoices((items) => items.filter((item) => item.id !== choice.id)); if (correct === choice.id) setCorrect('') }}>Удалить</button>}
        </div>)}
        <button type="button" onClick={() => setChoices((items) => [...items, { id: crypto.randomUUID().slice(0, 8), text: '' }])}>Добавить вариант</button>
      </fieldset>
    </>}
    {typeKey === 'answer.exact' && <>
      <label>Формулировка<input required value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
      <label>Допустимые ответы, по одному в строке<textarea required value={answers} onChange={(event) => setAnswers(event.target.value)} /></label>
    </>}
    {typeKey === 'algorithm.python' && <>
      <label>Условие<textarea required rows={5} value={statement} onChange={(event) => setStatement(event.target.value)} /></label>
      <fieldset><legend>Тесты</legend>
        {tests.map((test, index) => <div className="field-row" key={index}>
          <label>Ввод #{index + 1}<textarea value={test.input} onChange={(event) => setTests((items) => items.map((item, at) => at === index ? { ...item, input: event.target.value } : item))} /></label>
          <label>Ожидаемый вывод<textarea required value={test.output} onChange={(event) => setTests((items) => items.map((item, at) => at === index ? { ...item, output: event.target.value } : item))} /></label>
          {tests.length > 1 && <button type="button" onClick={() => setTests((items) => items.filter((_, at) => at !== index))}>Удалить</button>}
        </div>)}
        <button type="button" onClick={() => setTests((items) => [...items, { input: '', output: '' }])}>Добавить тест</button>
      </fieldset>
      <div className="field-row">
        <label>Лимит времени, мс<input type="number" min={100} value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))} /></label>
        <label>Лимит памяти, МБ<input type="number" min={32} value={memoryLimit} onChange={(event) => setMemoryLimit(Number(event.target.value))} /></label>
      </div>
    </>}
    {typeKey.startsWith('artifact.') && <label>Инструкция<textarea required rows={6} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>}
    <div className="actions"><button disabled={busy || !title.trim()}>{busy ? 'Сохраняем…' : 'Сохранить шаг'}</button><button type="button" onClick={onCancel}>Отмена</button></div>
  </form>
}
