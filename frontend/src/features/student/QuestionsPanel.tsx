import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import type { StepQuestion, StepQuestionMessage } from '../../api/types'
import { usePagedResource } from '../../hooks/usePagedResource'

export function QuestionsPanel({ enrollmentId, stepId }: { enrollmentId: string; stepId: string }) {
  const questions = usePagedResource(`questions:${enrollmentId}:${stepId}`, (page) => api.student.questions(enrollmentId, stepId, page))
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!question.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.student.ask(enrollmentId, stepId, question.trim())
      setQuestion('')
      questions.setPage(1)
      questions.reload()
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section className="card">
    <h2>Вопросы по этому шагу</h2>
    <p>Задай вопрос куратору или продолжи переписку.</p>
    {questions.loading && <Loading />}
    <ErrorNotice error={questions.error} onRetry={questions.reload} />
    {questions.data?.data.length === 0 && <p>Вопросов пока нет.</p>}
    {questions.data?.data.map((item) => <StudentQuestionThread key={item.id} item={item} onReply={questions.reload} />)}
    <Pagination meta={questions.data?.meta} page={questions.page} onPage={questions.setPage} />
    <ErrorNotice error={error} />
    <form onSubmit={submit} className="form-stack">
      <label>Новый вопрос<textarea required rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
      <button disabled={busy || !question.trim()}>{busy ? 'Отправляем…' : 'Задать вопрос'}</button>
    </form>
  </section>
}

function StudentQuestionThread({ item, onReply }: { item: StepQuestion; onReply: () => void }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const messages = threadMessages(item)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api.student.reply(item.id, reply.trim())
      setReply('')
      onReply()
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <article className="question-item">
    <div className="question-thread" aria-label="Переписка с куратором">
      {messages.map((message) => <div key={message.id} className={`question-message ${message.sender.role === 'student' ? 'question-message-own' : ''}`}>
        <strong>{message.sender.role === 'student' ? 'Ты' : 'Куратор'}</strong>
        <p>{message.body}</p>
        <time dateTime={message.created_at}>{formatMessageDate(message.created_at)}</time>
      </div>)}
    </div>
    <ErrorNotice error={error} />
    <form onSubmit={submit} className="form-stack question-reply-form">
      <label>Ответить<textarea rows={2} value={reply} onChange={(event) => setReply(event.target.value)} /></label>
      <button className="button-secondary" disabled={busy || !reply.trim()}>{busy ? 'Отправляем…' : 'Отправить сообщение'}</button>
    </form>
  </article>
}

function threadMessages(item: StepQuestion): StepQuestionMessage[] {
  if (item.messages?.length) return item.messages
  const legacy: StepQuestionMessage[] = [{ id: `${item.id}-question`, sender: item.student ?? { id: 'student', display_name: 'Ты', role: 'student' }, body: item.question, created_at: item.created_at }]
  if (item.answer) legacy.push({ id: `${item.id}-answer`, sender: { id: 'curator', display_name: 'Куратор', role: 'curator' }, body: item.answer, created_at: item.answered_at ?? item.created_at })
  return legacy
}

function formatMessageDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}
