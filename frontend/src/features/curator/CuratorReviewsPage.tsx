import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

function workCount(count: number) {
  const form = new Intl.PluralRules('ru-RU').select(count)
  return `${count} ${form === 'one' ? 'работа' : form === 'few' ? 'работы' : 'работ'}`
}

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
      {reviews.data && <span className="queue-count"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></svg>{workCount(reviews.data.meta.total)} {reviews.data.meta.total === 1 ? 'ждёт' : 'ждут'}</span>}
    </div>
    {reviews.loading && <Loading />}
    <ErrorNotice error={reviews.error} onRetry={reviews.reload} />
    {reviews.data && <section className="card queue-card" aria-labelledby="queue-title">
      <div className="queue-card-head"><h2 id="queue-title">Очередь ручной проверки</h2><p>{workCount(reviews.data.meta.total)}</p></div>
      {reviews.data.data.length === 0 ? <p className="table-empty">Очередь пуста. Все работы проверены.</p> :
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th scope="col">Ученик</th><th scope="col">Шаг</th><th scope="col">Ждёт</th><th scope="col">Темп</th><th scope="col"><span className="visually-hidden">Действие</span></th></tr></thead>
          <tbody>{reviews.data.data.map((item) => {
            const submissionId = item.submission_id ?? item.id
            return <tr key={submissionId}>
              <td><strong>{item.student?.display_name ?? 'Ученик'}</strong></td>
              <td><strong>{item.step?.title ?? 'Работа ученика'}</strong><small>{item.course_title ?? 'Курс не указан'}{item.status && <> · <Status value={item.status} /></>}</small></td>
              <td className="numeric"><time dateTime={item.created_at} title={item.created_at ? new Date(item.created_at).toLocaleString('ru-RU') : undefined}>{waitingSince(item.created_at)}</time></td>
              <td><span className="pace-label pace-unknown"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6h.01" /></svg>Нет данных</span></td>
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
