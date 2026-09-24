import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

function waitingSince(timestamp?: string) {
  if (!timestamp) return '—'
  const elapsed = Date.now() - new Date(timestamp).getTime()
  if (!Number.isFinite(elapsed)) return '—'
  const minutes = Math.max(0, Math.floor(elapsed / 60_000))
  if (minutes < 60) return `${minutes} м`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ч ${minutes % 60} м`
  return `${Math.floor(hours / 24)} д ${hours % 24} ч`
}

export function CuratorReviewsPage() {
  const reviews = usePagedResource('curator-reviews', api.curator.reviews)
  return <section>
    <div className="page-title">
      <div><h1>Очередь проверки</h1><p>Работы учеников, закреплённых за вами.</p></div>
      {reviews.data && <span className="queue-count">Ожидают проверки: {reviews.data.meta.total}</span>}
    </div>
    {reviews.loading && <Loading />}
    <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
    {reviews.data && <section className="card queue-card" aria-labelledby="queue-title">
      <div className="queue-card-head"><h2 id="queue-title">Очередь ручной проверки</h2><p>{reviews.data.meta.total} работ</p></div>
      {reviews.data.data.length === 0 ? <p className="table-empty">Очередь пуста. Все работы проверены.</p> :
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th scope="col">Ученик</th><th scope="col">Шаг</th><th scope="col">Ждёт</th><th scope="col">Состояние</th><th scope="col"><span className="visually-hidden">Действие</span></th></tr></thead>
          <tbody>{reviews.data.data.map((item) => {
            const submissionId = item.submission_id ?? item.id
            return <tr key={submissionId}>
              <td><strong>{item.student?.display_name ?? 'Ученик'}</strong></td>
              <td><strong>{item.step?.title ?? 'Работа ученика'}</strong>{item.course_title && <small>{item.course_title}</small>}</td>
              <td className="numeric"><time dateTime={item.created_at} title={item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : undefined}>{waitingSince(item.created_at)}</time></td>
              <td>{item.status && <Status value={item.status} />}</td>
              <td>{submissionId && <Link className="secondary-link" to={`/curator/submissions/${submissionId}`}>Открыть</Link>}</td>
            </tr>
          })}</tbody>
        </table>
      </div>
      }
    </section>}
    <Pagination meta={reviews.data?.meta} page={reviews.page} onPage={reviews.setPage} />
  </section>
}
