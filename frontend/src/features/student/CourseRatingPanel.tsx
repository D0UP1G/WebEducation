import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'

function deltaLabel(delta: number) {
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
}

export function CourseRatingPanel({ enrollmentId }: { enrollmentId: string }) {
  const rating = useResource(`course-rating:${enrollmentId}`, () => api.student.rating(enrollmentId))
  const recentChanges = rating.data?.recent_changes.slice(0, 5) ?? []

  return <section className="card course-rating-card" aria-label="Рейтинг и топ курса">
    <h2>Рейтинг курса</h2>
    {rating.loading && <Loading />}
    <ErrorNotice error={rating.error} onRetry={rating.reload} />
    {rating.data && <>
      <div className="course-rating-summary">
        <strong className="numeric">{rating.data.rating}</strong>
        <span>{rating.data.place ? `Место ${rating.data.place} из ${rating.data.participant_count}` : 'Место пока не определено'}</span>
      </div>
      <p className="course-rating-rules">
        Первый зачёт: +{rating.data.award_per_score_point} за каждый балл задания. Неверная или возвращённая попытка до зачёта: −{rating.data.wrong_attempt_penalty}.
        Теория, сбои проверки и время на решение на рейтинг не влияют.
      </p>

      <h3>Топ курса</h3>
      {rating.data.top.length ? <ol className="course-rating-leaders">
        {rating.data.top.map((leader) => <li key={`${leader.place}-${leader.display_name}`} className={leader.is_current_user ? 'is-current-user' : undefined}>
          <span><b>{leader.place}.</b> {leader.display_name}{leader.is_current_user && <small> · ты</small>}</span>
          <strong className="numeric">{leader.rating}</strong>
        </li>)}
      </ol> : <p className="muted">Пока нет участников для рейтинга.</p>}

      <h3 className="course-rating-changes-title">Последние изменения</h3>
      {recentChanges.length ? <ol className="course-rating-changes">
        {recentChanges.map((change) => <li key={change.id}>
          <span><strong>{change.step_title}</strong><small>{change.reason} · попытка №{change.attempt_number}</small></span>
          <b className={change.delta > 0 ? 'rating-up' : 'rating-down'}>{deltaLabel(change.delta)}</b>
        </li>)}
      </ol> : <p className="muted">Рейтинг изменится после первой проверяемой задачи.</p>}
      {rating.data.total_changes > recentChanges.length &&
        <p className="muted">Показаны последние {recentChanges.length} из {rating.data.total_changes} изменений.</p>}
    </>}
  </section>
}
