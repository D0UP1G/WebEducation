import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'

export function CuratorOverviewPage() {
  const students = useResource('curator-overview-students', api.curator.students)
  const reviews = useResource('curator-overview-reviews', api.curator.reviews)
  const questions = useResource('curator-overview-questions', api.curator.questions)
  return <section>
    <h1>Обзор куратора</h1>
    <p>Работы и вопросы закреплённых учеников.</p>
    <div className="card-grid">
      <article className="card"><h2>Мои ученики</h2>
        {students.loading && <Loading />}
        <ErrorNotice error={students.error} onRetry={students.reload} />
        {students.data && <p>Учеников: {students.data.meta.total}</p>}
        <Link to="/curator/students">Открыть список</Link>
      </article>
      <article className="card"><h2>Ожидают проверки</h2>
        {reviews.loading && <Loading />}
        <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
        {reviews.data && <p>Работ: {reviews.data.meta.total}</p>}
        <Link to="/curator/reviews">Перейти к работам</Link>
      </article>
      <article className="card"><h2>Вопросы без ответа</h2>
        {questions.loading && <Loading />}
        <ErrorNotice error={questions.error} onRetry={questions.reload} />
        {questions.data && <p>Вопросов: {questions.data.meta.total}</p>}
        <Link to="/curator/questions">Ответить</Link>
      </article>
    </div>
  </section>
}
