import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

export function CuratorReviewsPage() {
  const reviews = usePagedResource('curator-reviews', api.curator.reviews)
  return <section>
    <h1>Работы на проверке</h1>
    {reviews.loading && <Loading />}
    <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
    {reviews.data?.data.length === 0 && <p>Очередь пуста.</p>}
    {reviews.data?.data.map((item) => {
      const submissionId = item.submission_id ?? item.id
      return <article key={submissionId} className="card">
        <h2>{item.step?.title ?? 'Работа ученика'}</h2>
        <p>{item.student?.display_name ?? 'Ученик'}{item.course_title && ` · ${item.course_title}`}</p>
        {item.created_at && <p>Отправлено: {new Date(item.created_at).toLocaleString('ru-RU')}</p>}
        {submissionId && <Link to={`/curator/submissions/${submissionId}`}>Открыть работу</Link>}
      </article>
    })}
    <Pagination meta={reviews.data?.meta} page={reviews.page} onPage={reviews.setPage} />
  </section>
}
