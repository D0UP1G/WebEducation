import { useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { StepContent } from '../student/StepContent'

export function CuratorReviewPage() {
  const { submissionId = '' } = useParams()
  const submission = useResource(`curator-submission:${submissionId}`, () => api.curator.submission(submissionId))
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const commentRef = useRef<HTMLTextAreaElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const decision = submitter?.value === 'returned' ? 'returned' : 'accepted'
    if (decision === 'returned' && !comment.trim()) {
      setError('Добавьте комментарий, чтобы ученик понял, что поправить.')
      commentRef.current?.focus()
      return
    }
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
  const externalUrl = item?.artifact_url ?? item?.url
  return <section>
    <p><Link to="/curator/reviews">← К очереди</Link></p>
    {submission.loading && <Loading />}
    <ErrorNotice error={submission.error} onRetry={submission.reload} />
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    {item && <>
      <div className="page-title">
        <div>
          <p className="page-eyebrow">{item.student?.display_name ?? 'Ученик'} · попытка {item.attempt_number}</p>
          <h1>{item.step?.title ?? 'Проверка работы'}</h1>
          {item.course_title && <p>Курс «{item.course_title}»</p>}
        </div>
        <Status value={item.status} />
      </div>
      <div className="review-layout">
        <article className="card review-evidence">
          <h2>Работа {item.student?.display_name ?? 'ученика'}</h2>
          <p className="muted">Отправлена {new Date(item.created_at).toLocaleString('ru-RU')}</p>
          {item.step && <section className="evidence-task"><h3>Задание</h3><StepContent step={item.step} /></section>}
          {(externalUrl || item.download_url) && <p className="notice info">Файл или ссылка получены от ученика и не прошли полную проверку безопасности. Проверяйте адрес перед открытием и не запускайте скачанные файлы.</p>}
          {item.download_url && <div className="evidence-file">
            <span className="evidence-file-icon" aria-hidden="true">↥</span>
            <div><strong>Приложенный файл</strong><small>Попытка №{item.attempt_number}</small></div>
            <a className="secondary-link" href={item.download_url}>Скачать</a>
          </div>}
          {externalUrl && <div className="evidence-file">
            <span className="evidence-file-icon" aria-hidden="true">↗</span>
            <div><strong>Ссылка на результат</strong><small>{externalUrl}</small></div>
            <a className="secondary-link" href={externalUrl} target="_blank" rel="noopener noreferrer">Открыть ссылку</a>
          </div>}
          {item.explanation && <div className="evidence-comment"><strong>Комментарий ученика</strong><p>{item.explanation}</p></div>}
          {item.feedback && <div className="evidence-comment previous-comment"><strong>Предыдущий комментарий</strong><p>{item.feedback}</p></div>}
          {item.attempts?.length ? <section className="review-history">
            <h3>История попыток</h3>
            <ol>{item.attempts.map((attempt) => <li key={attempt.id}>№{attempt.attempt_number}: <Status value={attempt.status} />{attempt.feedback && ` · ${attempt.feedback}`}</li>)}</ol>
          </section> : null}
        </article>
        {item.status === 'pending_review' ? <form className="card review-decision" onSubmit={submit}>
          <h2>Решение</h2>
          <label>Комментарий ученику<textarea ref={commentRef} rows={5} placeholder="Напишите, что получилось или что поправить" value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          <p className="muted">При возврате комментарий обязателен.</p>
          <div className="decision-actions">
            <button type="submit" value="returned" className="return-button" disabled={busy}>Вернуть с комментарием</button>
            <button type="submit" value="accepted" className="primary-button" disabled={busy}>{busy ? 'Сохраняем…' : 'Принять работу'}</button>
          </div>
        </form> : <p className="card">По этой попытке решение уже принято.</p>}
      </div>
    </>}
  </section>
}
