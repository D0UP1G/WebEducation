import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'

export function CuratorOverviewPage() {
  const students = useResource('curator-overview-students', api.curator.students)
  const reviews = useResource('curator-overview-reviews', api.curator.reviews)
  const questions = useResource('curator-overview-questions', api.curator.questions)
  return <section>
    <div className="page-title"><div><h1>Обзор куратора</h1><p>Ученики, работы и вопросы, которые ждут вашего внимания.</p></div></div>
    <div className="card-grid overview-grid">
      <article className="card overview-metric"><h2>Мои ученики</h2>
        {students.loading && <Loading />}
        <ErrorNotice error={students.error} onRetry={students.reload} />
        {students.data && <p className="overview-number numeric">{students.data.meta.total}</p>}
        <p>Закреплённые ученики и их прогресс.</p>
        <Link className="secondary-link" to="/curator/students">Открыть список</Link>
      </article>
      <article className="card overview-metric"><h2>Ожидают проверки</h2>
        {reviews.loading && <Loading />}
        <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
        {reviews.data && <p className="overview-number numeric">{reviews.data.meta.total}</p>}
        <p>Работы в очереди ручной проверки.</p>
        <Link className="secondary-link" to="/curator/reviews">Перейти к работам</Link>
      </article>
      <article className="card overview-metric"><h2>Вопросы без ответа</h2>
        {questions.loading && <Loading />}
        <ErrorNotice error={questions.error} onRetry={questions.reload} />
        {questions.data && <p className="overview-number numeric">{questions.data.meta.total}</p>}
        <p>Вопросы по шагам курса.</p>
        <Link className="secondary-link" to="/curator/questions">Ответить</Link>
      </article>
    </div>
  </section>
}
