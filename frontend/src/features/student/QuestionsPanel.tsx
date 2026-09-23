import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
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
    {questions.loading && <Loading />}
    <ErrorNotice error={questions.error} onRetry={questions.reload} />
    {questions.data?.data.length === 0 && <p>Вопросов пока нет.</p>}
    {questions.data?.data.map((item) => <article key={item.id} className="question-item">
      <p><strong>Вы:</strong> {item.question}</p>
      <p><strong>Куратор:</strong> {item.answer || 'Ответ ещё не получен'}</p>
    </article>)}
    <Pagination meta={questions.data?.meta} page={questions.page} onPage={questions.setPage} />
    <ErrorNotice error={error} />
    <form onSubmit={submit} className="form-stack">
      <label>Новый вопрос<textarea required rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
      <button disabled={busy || !question.trim()}>{busy ? 'Отправляем…' : 'Задать вопрос'}</button>
    </form>
  </section>
}
