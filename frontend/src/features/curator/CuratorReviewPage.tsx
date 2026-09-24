import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { StepContent } from '../student/StepContent'

export function CuratorReviewPage() {
  const { submissionId = '' } = useParams()
  const submission = useResource(`curator-submission:${submissionId}`, () => api.curator.submission(submissionId))
  const [decision, setDecision] = useState<'accepted' | 'returned'>('accepted')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.curator.review(submissionId, decision, comment.trim())
      setMessage(decision === 'accepted' ? 'Работа принята' : 'Работа возвращена с комментарием')
      submission.reload()
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  const item = submission.data
  return <section>
    <p><Link to="/curator/reviews">← К очереди</Link></p>
    <h1>Проверка работы</h1>
    {submission.loading && <Loading />}
    <ErrorNotice error={submission.error} onRetry={submission.reload} />
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    {item && <>
      <div className="card">
        <h2>{item.step?.title ?? 'Сдача'}</h2>
        {item.course_title && <p>Курс: {item.course_title}</p>}
        {item.step && <><h3>Задание</h3><StepContent step={item.step} /></>}
        <p>Ученик: {item.student?.display_name ?? '—'} · Попытка №{item.attempt_number} · <Status value={item.status} /></p>
        {item.artifact_url && <p>Ссылка на результат: <a href={item.artifact_url} target="_blank" rel="noopener noreferrer">Открыть</a></p>}
        {item.url && <p>Ссылка на результат: <a href={item.url} target="_blank" rel="noopener noreferrer">Открыть</a></p>}
        {item.download_url && <p><a href={item.download_url}>Скачать приложенный файл</a></p>}
        {item.feedback && <p>Предыдущий комментарий: {item.feedback}</p>}
        {item.attempts?.length ? <><h3>История попыток</h3><ol>{item.attempts.map((attempt) =>
          <li key={attempt.id}>№{attempt.attempt_number}: <Status value={attempt.status} />{attempt.feedback && ` · ${attempt.feedback}`}</li>)}</ol></> : null}
      </div>
      {item.status === 'pending_review' ? <form className="card form-stack" onSubmit={submit}>
        <h2>Решение</h2>
        <label>Действие<select value={decision} onChange={(event) => setDecision(event.target.value as 'accepted' | 'returned')}>
          <option value="accepted">Принять</option><option value="returned">Вернуть на доработку</option>
        </select></label>
        <label>Комментарий<textarea required={decision === 'returned'} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
        <button disabled={busy || (decision === 'returned' && !comment.trim())}>{busy ? 'Сохраняем…' : 'Отправить решение'}</button>
      </form> : <p>По этой попытке решение уже принято.</p>}
    </>}
  </section>
}
