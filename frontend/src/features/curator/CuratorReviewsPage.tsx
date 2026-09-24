import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

export function CuratorReviewsPage() {
  const reviews = usePagedResource('curator-reviews', api.curator.reviews)
  return <section>
    <div className="page-title">
      <div><h1>Очередь проверки</h1><p>Работы учеников, закреплённых за вами.</p></div>
      {reviews.data && <span className="queue-count">Ожидают проверки: {reviews.data.meta.total}</span>}
    </div>
    {reviews.loading && <Loading />}
    <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
    {reviews.data?.data.length === 0 && <p>Очередь пуста.</p>}
    {reviews.data && reviews.data.data.length > 0 && <section className="card queue-card" aria-labelledby="queue-title">
      <h2 id="queue-title">Ручная проверка</h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th scope="col">Ученик</th><th scope="col">Шаг</th><th scope="col">Отправлено</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действие</span></th></tr></thead>
          <tbody>{reviews.data.data.map((item) => {
            const submissionId = item.submission_id ?? item.id
            return <tr key={submissionId}>
              <td><strong>{item.student?.display_name ?? 'Ученик'}</strong></td>
              <td><strong>{item.step?.title ?? 'Работа ученика'}</strong>{item.course_title && <small>{item.course_title}</small>}</td>
              <td className="numeric">{item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : '—'}</td>
              <td>{item.status && <Status value={item.status} />}</td>
              <td>{submissionId && <Link className="secondary-link" to={`/curator/submissions/${submissionId}`}>Открыть</Link>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>}
    <Pagination meta={reviews.data?.meta} page={reviews.page} onPage={reviews.setPage} />
  </section>
}
