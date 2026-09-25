import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import type { Step, Submission } from '../../api/types'
import { createUuid } from '../../utils/uuid'
import { runPythonSample, type PythonResult, type PythonSample } from './pythonRunner'

const PythonCodeEditor = lazy(() => import('./PythonCodeEditor').then(({ PythonCodeEditor: editor }) => ({ default: editor })))

const isActive = (status: Submission['status']) =>
  status === 'queued' || status === 'checking' || status === 'pending_review'

const pythonFailureLabels: Record<string, string> = {
  wrong_answer: 'неверный ответ',
  runtime_error: 'ошибка выполнения',
  time_limit: 'превышен лимит времени',
  memory_limit: 'превышен лимит памяти',
  output_limit: 'превышен лимит вывода',
  environment_error: 'ошибка среды',
}

function pythonDiagnostics(diagnostics: Submission['safe_diagnostics']): string | null {
  if (!diagnostics || typeof diagnostics.passed_tests !== 'number' || typeof diagnostics.total_tests !== 'number') return null
  const reason = typeof diagnostics.reason === 'string' ? pythonFailureLabels[diagnostics.reason] : null
  return `Пройдено ${diagnostics.passed_tests} из ${diagnostics.total_tests} тестов.${reason ? ` Причина: ${reason}.` : ''}`
}

export function SubmissionPanel({ enrollmentId, step, accepted, disabled = false, onUpdated }: {
  enrollmentId: string
  step: Step
  accepted: boolean
  disabled?: boolean
  onUpdated: () => void
}) {
  const pythonDraftKey = `webeducation:python-draft:${enrollmentId}:${step.id}`
  const [codeDraft, setCodeDraft] = useState(() => ({ key: pythonDraftKey, value: readPythonDraft(pythonDraftKey) }))
  const code = codeDraft.key === pythonDraftKey ? codeDraft.value : ''
  const history = usePagedResource(`submissions:${enrollmentId}:${step.id}`, (page) => api.student.submissions(enrollmentId, step.id, page))
  const [current, setCurrent] = useState<Submission | null>(null)
  const [answer, setAnswer] = useState('')
  const [answers, setAnswers] = useState<string[]>([])
  const [pythonTestInput, setPythonTestInput] = useState<string | null>(null)
  const [localInput, setLocalInput] = useState<string | null>(null)
  const [url, setUrl] = useState('')
  const [explanation, setExplanation] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [checkingLocally, setCheckingLocally] = useState(false)
  const [localResult, setLocalResult] = useState<PythonResult | null>(null)
  const [localSample, setLocalSample] = useState<PythonSample | null>(null)
  const [error, setError] = useState<unknown>(null)
  const onUpdatedRef = useRef(onUpdated)
  onUpdatedRef.current = onUpdated

  useEffect(() => {
    if (codeDraft.key !== pythonDraftKey) {
      setCodeDraft({ key: pythonDraftKey, value: readPythonDraft(pythonDraftKey) })
    }
  }, [codeDraft.key, pythonDraftKey])

  useEffect(() => {
    if (codeDraft.key !== pythonDraftKey) return
    try {
      if (codeDraft.value) window.localStorage.setItem(pythonDraftKey, codeDraft.value)
      else window.localStorage.removeItem(pythonDraftKey)
    } catch { /* Local storage may be disabled; the editor remains usable for this visit. */ }
  }, [codeDraft, pythonDraftKey])

  useEffect(() => {
    setCurrent(null)
    setAnswer('')
    setAnswers([])
    setPythonTestInput(null)
    setUrl('')
    setExplanation('')
    setFile(null)
    setLocalResult(null)
    setLocalSample(null)
    setLocalInput(null)
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
    setLocalResult(null)
    setLocalInput(null)
    setError(null)
    try {
      const sample = await api.student.pythonSample(enrollmentId, step.id)
      const input = pythonTestInput ?? sample.sample.input
      const result = await runPythonSample(code, sample, input)
      setLocalSample(sample)
      setLocalInput(input)
      setLocalResult(result)
    } catch (reason) { setError(reason) }
    finally { setCheckingLocally(false) }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api.student.submit(enrollmentId, step.id, payload(), createUuid())
      setCurrent(created)
      history.setPage(1)
      history.reload()
      onUpdated()
      setAnswer('')
      setAnswers([])
      setLocalResult(null)
      setLocalInput(null)
      setUrl('')
      setExplanation('')
      setFile(null)
      setFileInputKey((value) => value + 1)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  const latest = current ?? history.data?.data[0] ?? null
  const pythonStep = step.type_key === 'algorithm.python'
  const locked = disabled || (accepted && !pythonStep) || busy || checkingLocally || (latest ? isActive(latest.status) : false)
  const source = step.type_key.startsWith('artifact.') ? 'manual' : step.type_key === 'theory' ? undefined : 'automatic'
  const requiredEvidence = new Set(step.content.required_evidence ?? [])
  const evidenceMissing = [...requiredEvidence].some((field) =>
    field === 'file' ? !file : field === 'url' ? !url.trim() : !explanation.trim(),
  )
  const evidenceLabels = { file: 'файл', url: 'ссылка', explanation: 'пояснение' }

  return (
    <section className="card" aria-labelledby="submission-heading">
      <h2 id="submission-heading">Сдать шаг</h2>
      {accepted && <p>{pythonStep
        ? 'Шаг уже зачтён. Можно отправлять другие варианты решения; предыдущий зачёт и баллы сохранятся.'
        : 'Шаг зачтён, баллы начислены.'}</p>}
      {latest && <p>Последняя попытка №{latest.attempt_number}: <Status value={latest.status} source={source} />{latest.score != null && ` · ${latest.score} / ${latest.max_score} баллов`}</p>}
      {latest?.feedback && <p className="notice info">Комментарий: {latest.feedback}</p>}
      {latest?.explanation && <p>Твоё пояснение: {latest.explanation}</p>}
      {latest?.image_preview_url && <figure className="artifact-image-preview"><img src={latest.image_preview_url} alt="Предпросмотр отправленного изображения" /><figcaption>Предпросмотр изображения из последней попытки</figcaption></figure>}
      {latest?.download_url && <p><a href={latest.download_url}>Скачать приложенный файл</a></p>}
      {latest && pythonDiagnostics(latest.safe_diagnostics) &&
        <p className="muted">Детали проверки: {pythonDiagnostics(latest.safe_diagnostics)}</p>}
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
          <p className="notice info">Самопроверка запускает код на открытом примере без начисления баллов. Официальная проверка запускает код на сервере по всем тестам.</p>
          <div className="python-editor-field">
            <span id="python-code-label">Код Python</span>
            <Suspense fallback={<div className="python-editor-loading" role="status">Загрузка редактора…</div>}>
              <PythonCodeEditor ariaLabel="Код Python" value={code} disabled={locked} onChange={(value) => { setCodeDraft({ key: pythonDraftKey, value }); setLocalResult(null); setLocalSample(null); setLocalInput(null) }} />
            </Suspense>
          </div>
          <label>Входные данные для тестового примера<textarea rows={3} value={pythonTestInput ?? ''} disabled={locked} placeholder="Оставь пустым, чтобы использовать открытый пример" onChange={(event) => { setPythonTestInput(event.target.value); setLocalResult(null); setLocalInput(null) }} /></label>
          <p className="muted">Свои входные данные нужны только для запуска на твоём устройстве. Они не отправляются на сервер и не влияют на зачёт.</p>
          <button type="button" disabled={locked || !code.trim()} onClick={checkLocally}>{checkingLocally ? 'Запускаем…' : 'Проверить тестовый пример'}</button>
          {localResult && localSample && <div role="status" className="notice info">
            {localInput === localSample.sample.input && localResult.exit_code === 0
              ? <strong>Открытый пример: {localResult.stdout.trimEnd() === localSample.sample.output.trimEnd() ? 'верно' : 'ответ отличается от ожидаемого'}.</strong>
              : <strong>{localResult.exit_code === 0 ? 'Результат запуска' : localResult.exit_code === 124 ? 'Превышен лимит времени'
                : localResult.exit_code === 123 ? 'Превышен лимит вывода'
                  : localResult.exit_code === 125 ? 'Среда Python недоступна' : 'Ошибка выполнения'}.</strong>}
            <p>Вход:</p><pre>{localInput || '(пустой)'}</pre>
            {localInput === localSample.sample.input && <><p>Ожидаемый вывод открытого примера:</p><pre>{localSample.sample.output || '(пустой)'}</pre></>}
            <p>Полученный вывод:</p><pre>{localResult.stdout || '(пустой)'}</pre>
            {localResult.stderr && <><p>Ошибка:</p><pre>{localResult.stderr}</pre></>}
            <p>Время: {localResult.duration_ms} мс. Итоговый зачёт определяется только сервером.</p>
          </div>}
        </>}
        {step.type_key.startsWith('artifact.') && <>
          {requiredEvidence.size ? <p className="notice info">Для этого задания добавь в одной попытке: {[...requiredEvidence].map((field) => evidenceLabels[field]).join(', ')}.</p>
            : <p>Добавь файл, ссылку или оба варианта. Если нужно, коротко объясни, что проверить куратору.</p>}
          <label>Ссылка{requiredEvidence.has('url') && ' *'}<input type="url" required={requiredEvidence.has('url')} value={url} disabled={locked} onChange={(event) => setUrl(event.target.value)} /></label>
          <label>Файл{requiredEvidence.has('file') && ' *'}<input key={fileInputKey} type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.sb3,.mcworld" disabled={locked} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <small className="muted">Поддерживаются PNG, JPG, JPEG, WEBP, PDF, SB3 и MCWORLD. Максимальный размер — согласно ограничению сервера.</small>
          <label>Пояснение{requiredEvidence.has('explanation') && ' *'}<textarea rows={3} maxLength={5000} required={requiredEvidence.has('explanation')} value={explanation} disabled={locked} onChange={(event) => setExplanation(event.target.value)} /></label>
        </>}
        {(!accepted || pythonStep) && <button type="submit" disabled={locked || (step.type_key === 'algorithm.python' && !code.trim()) || (step.type_key === 'quiz.multiple_choice' && answers.length === 0) || (step.type_key.startsWith('artifact.') && ((!url.trim() && !file) || evidenceMissing))}>
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

function readPythonDraft(key: string) {
  try { return typeof window === 'undefined' ? '' : window.localStorage.getItem(key) ?? '' }
  catch { return '' }
}
