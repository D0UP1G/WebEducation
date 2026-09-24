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
    <div className="page-title"><div><h1>Вопросы учеников</h1><p>Ответы привязаны к конкретным шагам курса.</p></div>
      {questions.data && <span className="queue-count">Без ответа: {questions.data.meta.total}</span>}
    </div>
    {message && <InfoNotice>{message}</InfoNotice>}
    {questions.loading && <Loading />}
    <ErrorNotice error={questions.error} onRetry={questions.reload} />
    {questions.data?.data.length === 0 && <div className="card"><p>Вопросов без ответа нет.</p></div>}
    {questions.data?.data.map((item) => <QuestionItem key={item.id} item={item} onAnswered={() => { setMessage('Ответ отправлен'); questions.setPage(1); questions.reload() }} />)}
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
    <div className="evidence-comment"><strong>{item.student?.display_name ?? 'Ученик'} спрашивает</strong><p>{item.question}</p></div>
    <ErrorNotice error={error} />
    <form className="form-stack" onSubmit={submit}>
      <label>Ответ<textarea required rows={3} value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
      <button disabled={busy || !answer.trim()}>{busy ? 'Отправляем…' : 'Ответить'}</button>
    </form>
  </article>
}
