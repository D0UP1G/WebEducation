import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import type { Step, Submission } from '../../api/types'
import { runPythonTests, type PythonResult } from './pythonRunner'

const isActive = (status: Submission['status']) =>
  status === 'queued' || status === 'checking' || status === 'pending_review'

export function SubmissionPanel({ enrollmentId, step, accepted, disabled = false, onUpdated }: {
  enrollmentId: string
  step: Step
  accepted: boolean
  disabled?: boolean
  onUpdated: () => void
}) {
  const history = usePagedResource(`submissions:${enrollmentId}:${step.id}`, (page) => api.student.submissions(enrollmentId, step.id, page))
  const [current, setCurrent] = useState<Submission | null>(null)
  const [answer, setAnswer] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [url, setUrl] = useState('')
  const [explanation, setExplanation] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [checkingLocally, setCheckingLocally] = useState(false)
  const [localResults, setLocalResults] = useState<PythonResult[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  useEffect(() => {
    setCurrent(null)
    setAnswer('')
    setAnswers([])
    setCode('')
    setUrl('')
    setExplanation('')
    setFile(null)
    setLocalResults(null)
  }, [step.id])

  useEffect(() => {
    if (!current && history.page === 1 && history.data?.data.length) setCurrent(history.data.data[0])
  }, [current, history.data])

  useEffect(() => {
    if (!current || !isActive(current.status)) return
    let stopped = false
    let attempt = 0
    let timer: number
    async function poll() {
      try {
        const updated = await api.student.submission(current!.id)
        if (stopped) return
        setCurrent(updated)
        if (!isActive(updated.status)) {
          history.reload()
          onUpdatedRef.current()
          return
        }
      } catch (reason) { if (!stopped) setError(reason) }
      if (!stopped) {
        attempt += 1
        timer = window.setTimeout(poll, current!.status === 'pending_review' ? 12000 : Math.min(30000, 2000 * 2 ** attempt))
      }
    }
    timer = window.setTimeout(poll, current.status === 'pending_review' ? 12000 : 2000)
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [current?.id, current?.status])

  function payload(): object | FormData {
    if (step.type_key === 'theory') return { action: 'complete' }
    if (step.type_key === 'quiz.single_choice' || step.type_key === 'answer.exact' || step.type_key === 'scratch.numeric_answer') return { answer: answer.trim() }
    if (step.type_key === 'quiz.multiple_choice') return { answer: answers }
    if (step.type_key === 'algorithm.python') return { code }
    if (file) {
      const data = new FormData()
      data.append('file', file)
      if (url.trim()) data.append('url', url.trim())
      if (explanation.trim()) data.append('explanation', explanation.trim())
      return data
    }
    return { url: url.trim(), ...(explanation.trim() ? { explanation: explanation.trim() } : {}) }
  }

  async function checkLocally() {
    setCheckingLocally(true)
    setLocalResults(null)
    setError(null)
    try {
      const challenge = await api.student.pythonChallenge(enrollmentId, step.id, code)
      setLocalResults(await runPythonTests(code, challenge))
    } catch (reason) { setError(reason) }
    finally { setCheckingLocally(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      let body = payload()
      if (step.type_key === 'algorithm.python') {
        const challenge = await api.student.pythonChallenge(enrollmentId, step.id, code)
        const results = await runPythonTests(code, challenge)
        body = { code, challenge_token: challenge.challenge_token, results }
      }
      const created = await api.student.submit(enrollmentId, step.id, body, crypto.randomUUID())
      setCurrent(created)
      history.setPage(1)
      history.reload()
      onUpdated()
      setAnswer('')
      setAnswers([])
      setCode('')
      setUrl('')
      setExplanation('')
      setFile(null)
      setFileInputKey((value) => value + 1)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  const latest = current ?? history.data?.data[0] ?? null
  const locked = disabled || accepted || busy || checkingLocally || (latest ? isActive(latest.status) : false)
  const source = step.type_key.startsWith('artifact.') ? 'manual' : step.type_key === 'theory' ? undefined : 'automatic'

  return (
    <section className="card" aria-labelledby="submission-heading">
      <h2 id="submission-heading">Сдать шаг</h2>
      {accepted && <p>Шаг зачтён, баллы начислены.</p>}
      {latest && <p>Последняя попытка №{latest.attempt_number}: <Status value={latest.status} source={source} />{latest.score != null && ` · ${latest.score} / ${latest.max_score} баллов`}</p>}
      {latest?.feedback && <p className="notice info">Комментарий: {latest.feedback}</p>}
      {latest?.explanation && <p>Твоё пояснение: {latest.explanation}</p>}
      {latest?.safe_diagnostics && Object.keys(latest.safe_diagnostics).length > 0 &&
        <p className="muted">Детали проверки: {JSON.stringify(latest.safe_diagnostics)}</p>}
      <ErrorNotice error={error} />
      <form onSubmit={submit} className="form-stack">
        {step.type_key === 'quiz.single_choice' &&
          <fieldset disabled={locked}>
            <legend>Выберите один вариант</legend>
            {step.content.choices?.map((choice) => <label className="choice" key={choice.id}>
              <input type="radio" name="answer" value={choice.id} checked={answer === choice.id} onChange={() => setAnswer(choice.id)} required />
              {choice.text}
            </label>)}
          </fieldset>}
        {step.type_key === 'quiz.multiple_choice' &&
          <fieldset disabled={locked}>
            <legend>Выберите все верные варианты</legend>
            {step.content.choices?.map((choice) => <label className="choice" key={choice.id}>
              <input type="checkbox" value={choice.id} checked={answers.includes(choice.id)} onChange={() => setAnswers((items) => items.includes(choice.id) ? items.filter((id) => id !== choice.id) : [...items, choice.id])} />
              {choice.text}
            </label>)}
          </fieldset>}
        {(step.type_key === 'answer.exact' || step.type_key === 'scratch.numeric_answer') &&
          <label>Твой ответ<input value={answer} required disabled={locked} onChange={(event) => setAnswer(event.target.value)} /></label>}
        {step.type_key === 'algorithm.python' && <>
          <p className="notice info">Локальная самопроверка не начисляет баллы. Текущая отправка использует браузерный результат и пока не является защищённым зачётом.</p>
          <label>Код Python<textarea rows={12} spellCheck={false} value={code} required disabled={locked} onChange={(event) => { setCode(event.target.value); setLocalResults(null) }} /></label>
          <button type="button" disabled={locked || !code.trim()} onClick={checkLocally}>{checkingLocally ? 'Запускаем…' : 'Проверить локально'}</button>
          {localResults && <div role="status" className="notice info">
            <strong>Самопроверка: запущено {localResults.length} {localResults.length === 1 ? 'тест' : localResults.length < 5 ? 'теста' : 'тестов'}.</strong>{' '}
            {localResults.some((item) => item.exit_code !== 0)
              ? 'Есть ошибка запуска или превышен лимит. Исправь код и попробуй снова.'
              : 'Код запустился. Правильность ответов и баллы здесь не определяются.'}
          </div>}
        </>}
        {step.type_key.startsWith('artifact.') && <>
          <p>Добавь файл, ссылку или оба варианта. Если нужно, коротко объясни, что проверить куратору.</p>
          <label>Ссылка<input type="url" value={url} disabled={locked} onChange={(event) => setUrl(event.target.value)} /></label>
          <label>Файл<input key={fileInputKey} type="file" disabled={locked} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <label>Пояснение<textarea rows={3} maxLength={5000} value={explanation} disabled={locked} onChange={(event) => setExplanation(event.target.value)} /></label>
        </>}
        {!accepted && <button type="submit" disabled={locked || (step.type_key === 'quiz.multiple_choice' && answers.length === 0) || (step.type_key.startsWith('artifact.') && !url.trim() && !file)}>
          {busy ? 'Проверяем…' : step.type_key === 'theory' ? 'Прочитал' : 'Отправить на проверку'}
        </button>}
      </form>
      <h3>История попыток</h3>
      {history.loading && <Loading />}
      <ErrorNotice error={history.error} onRetry={history.reload} />
      {history.data?.data.length === 0 && <p>Попыток пока нет.</p>}
      <ol>
        {history.data?.data.map((item) => <li key={item.id}>№{item.attempt_number} · <Status value={item.status} source={source} /> · {new Date(item.created_at).toLocaleString('ru-RU')}{item.feedback && ` · ${item.feedback}`}</li>)}
      </ol>
      <Pagination meta={history.data?.meta} page={history.page} onPage={history.setPage} />
    </section>
  )
}
