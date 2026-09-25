import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import type { StepQuestion } from '../../api/types'
import { StepContent } from '../student/StepContent'

export function CuratorQuestionsPage() {
  const questions = usePagedResource('curator-questions', api.curator.questions)
  const [message, setMessage] = useState('')
  return <section>
    <div className="page-title"><div><h1>Вопросы учеников</h1><p>Продолжайте переписку по каждому шагу курса.</p></div>
      {questions.data && <span className="queue-count">Переписок: {questions.data.meta.total}</span>}
    </div>
    {message && <InfoNotice>{message}</InfoNotice>}
    {questions.loading && <Loading />}
    <ErrorNotice error={questions.error} onRetry={questions.reload} />
    {questions.data?.data.length === 0 && <div className="card"><p>Вопросов пока нет.</p></div>}
    {questions.data?.data.map((item) => <QuestionItem key={item.id} item={item} onAnswered={() => { setMessage('Сообщение отправлено'); questions.setPage(1); questions.reload() }} />)}
    <Pagination meta={questions.data?.meta} page={questions.page} onPage={questions.setPage} />
  </section>
}

function QuestionItem({ item, onAnswered }: { item: StepQuestion; onAnswered: () => void }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try { await api.curator.answer(item.id, answer.trim()); onAnswered() }
    catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <article className="card question-card">
    <h2>{item.step?.title ?? 'Вопрос по шагу'}</h2>
    {item.course_title && <p>Курс: {item.course_title}</p>}
    {item.step && <><h3>Материал шага</h3><StepContent step={item.step} />
      {item.step.type_key.startsWith('quiz.') && item.step.content.choices?.length ?
        <ul>{item.step.content.choices.map((choice) => <li key={choice.id}>{choice.text}</li>)}</ul> : null}
    </>}
    <div className="question-thread" aria-label="Переписка с учеником">
      {(item.messages?.length ? item.messages : [{ id: `${item.id}-legacy`, sender: item.student, body: item.question, created_at: item.created_at }]).map((message) => <div key={message.id} className={`question-message ${message.sender?.role === 'curator' ? 'question-message-own' : ''}`}>
        <strong>{message.sender?.role === 'curator' ? 'Вы' : (message.sender?.display_name ?? item.student?.display_name ?? 'Ученик')}</strong>
        <p>{message.body}</p>
        <time dateTime={message.created_at}>{formatMessageDate(message.created_at)}</time>
      </div>)}
    </div>
    <ErrorNotice error={error} />
    <form className="form-stack" onSubmit={submit}>
      <label>Сообщение<textarea required rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button disabled={busy || !answer.trim()}>{busy ? 'Отправляем…' : 'Отправить сообщение'}</button>
    </form>
  </article>
}

function formatMessageDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
