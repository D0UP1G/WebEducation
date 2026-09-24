import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { StudentEnrollment, Step } from '../../api/types'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

function sourceFor(typeKey: Step['type_key']): 'manual' | 'automatic' | undefined {
  if (typeKey.startsWith('artifact.')) return 'manual'
  if (typeKey !== 'theory') return 'automatic'
  return undefined
}

function pointsLabel(points: number) {
  const form = new Intl.PluralRules('ru-RU').select(points)
  return `${points} ${form === 'one' ? 'балл' : form === 'few' ? 'балла' : 'баллов'}`
}

function CourseDetails({ detail, enrollmentId }: { detail: StudentEnrollment; enrollmentId: string }) {
  const next = detail.steps.find((step) => step.id === detail.progress.next_step_id)
  function pointsFor(predicate: (step: Step) => boolean) {
    const ids = new Set(detail.steps.filter(predicate).map((step) => step.id))
    return detail.progress.steps.reduce((sum, row) => sum + (ids.has(row.step_id) ? row.earned_points : 0), 0)
  }
  const groups = [
    { label: 'Теория', points: pointsFor((step) => step.type_key === 'theory') },
    { label: 'Проверено тестами', points: pointsFor((step) => sourceFor(step.type_key) === 'automatic') },
    { label: 'Принято куратором', points: pointsFor((step) => sourceFor(step.type_key) === 'manual') },
  ]

  return <>
    <h1>{detail.title}</h1>
    <EnrollmentStatusNotice status={detail.status} />
    <p>{detail.description}</p>
    <p className="muted">Версия курса: {detail.version}</p>
    {detail.status === 'active' && detail.progress.next_step_id && <section className="course-hero" aria-label="Следующий шаг">
      <p className="eyebrow">Следующий шаг{next ? ` · ${next.position} из ${detail.progress.total_steps}` : ''}</p>
      <h2>{next?.title ?? 'Продолжить курс'}</h2>
      <p>{detail.progress.next_action === 'revise_submission' ? 'Посмотри комментарий и попробуй ещё раз.' : 'Открой задание и двигайся дальше.'}</p>
      <Link className="action-link" to={`/student/courses/${enrollmentId}/steps/${detail.progress.next_step_id}`}>Продолжить →</Link>
    </section>}
    {detail.progress.next_action === 'await_review' && <p>Работа проверяется куратором.</p>}
    {detail.progress.next_action === 'course_complete' && <p>Курс завершён.</p>}
    <div className="card course-progress">
      <h2>Твой результат</h2>
      <p>{detail.progress.completed_steps} из {detail.progress.total_steps} шагов зачтено · {detail.progress.completion_percent}% курса</p>
      <progress value={detail.progress.completion_percent} max={100} aria-label="Процент завершения" />
      <p><strong>{detail.progress.earned_points} из {detail.progress.available_points} баллов</strong> · {detail.progress.rating_percent}% доступных баллов</p>
      <ul className="score-breakdown">
        {groups.map(({ label, points }) => <li key={label}><span>{label}</span><strong>{pointsLabel(points)}</strong></li>)}
      </ul>
    </div>
    <h2>Шаги</h2>
    <ol className="step-list">
      {detail.steps.map((step) => {
        const progress = detail.progress.steps.find((item) => item.step_id === step.id)
        return <li key={step.id}>
          <Link to={`/student/courses/${enrollmentId}/steps/${step.id}`}>{step.title}</Link>
          <span>{progress && <Status value={progress.status} source={progress.status === 'accepted' ? sourceFor(step.type_key) : undefined} />} · {progress?.earned_points ?? 0} / {step.max_score} баллов</span>
        </li>
      })}
    </ol>
  </>
}

export function StudentCoursePage() {
  const { enrollmentId = '' } = useParams()
  const course = useResource(`enrollment:${enrollmentId}`, () => api.student.enrollment(enrollmentId))
  return <section>
    <p><Link to="/student/courses">← Мои курсы</Link></p>
    {course.loading && <Loading />}
    <ErrorNotice error={course.error} onRetry={course.reload} />
    {course.data && <CourseDetails detail={course.data} enrollmentId={enrollmentId} />}
  </section>
}
