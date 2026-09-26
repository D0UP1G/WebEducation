import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { StudentEnrollment } from '../../api/types'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { CourseRoute, CourseScoreCard, stepTypeLabel } from './CourseRoute'
import { CourseRatingPanel } from './CourseRatingPanel'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

function CourseDetails({ detail }: { detail: StudentEnrollment }) {
  const next = detail.steps.find((step) => step.id === detail.progress.next_step_id)
  const courseGoal = detail.goal?.trim() || detail.description
  return <>
    <div className="page-title">
      <div>
        <h1>{detail.title}</h1>
        {courseGoal && <p>{courseGoal}</p>}
        <p className="muted">Версия курса: {detail.version}</p>
      </div>
      <EnrollmentStatusNotice status={detail.status} />
    </div>
    {(detail.tool || detail.volume || detail.grade_min !== undefined || detail.grade_max !== undefined) && <dl className="course-passport" aria-label="О курсе">
      {detail.tool && <div><dt>Инструмент</dt><dd>{detail.tool}</dd></div>}
      {detail.volume && <div><dt>Объём</dt><dd>{detail.volume}</dd></div>}
      {(detail.grade_min !== undefined || detail.grade_max !== undefined) && <div>
        <dt>Класс</dt>
        <dd>{detail.grade_min ?? '—'}–{detail.grade_max ?? '—'}</dd>
      </div>}
    </dl>}
    <div className="student-dashboard">
      {detail.status === 'active' && detail.progress.next_step_id && <section className="course-hero" aria-label={detail.progress.next_action === 'await_review' ? 'Текущая сдача' : 'Следующий шаг'}>
        <div className="hero-meta"><span>{detail.progress.next_action === 'await_review' ? 'Работа на проверке' : 'Следующий шаг'}{next ? ` · ${next.position} из ${detail.progress.total_steps}` : ''}</span>{next && <span>{stepTypeLabel(next.type_key)}</span>}</div>
        <h2>{next?.title ?? 'Продолжить курс'}</h2>
        <p>{detail.progress.next_action === 'await_review'
          ? 'Дождись решения куратора — после зачёта откроется следующий шаг.'
          : detail.progress.next_action === 'revise_submission'
            ? 'Посмотри комментарий и попробуй ещё раз.'
            : 'Открой задание и двигайся дальше.'}</p>
        <Link className="action-link" to={`/student/courses/${detail.id}/steps/${detail.progress.next_step_id}`}>
          {detail.progress.next_action === 'await_review' ? 'Посмотреть сдачу →' : 'Продолжить →'}
        </Link>
      </section>}
      <div className="course-student-sidebar">
        <CourseScoreCard detail={detail} />
        <CourseRatingPanel enrollmentId={detail.id} />
      </div>
    </div>
    {detail.progress.next_action === 'await_review' && <p>Работа проверяется куратором.</p>}
    {detail.progress.next_action === 'course_complete' && <p>Курс завершён.</p>}
    <CourseRoute detail={detail} />
  </>
}

export function StudentCoursePage() {
  const { enrollmentId = '' } = useParams()
  const course = useResource(`enrollment:${enrollmentId}`, () => api.student.enrollment(enrollmentId))
  return <section>
    {course.loading && <Loading />}
    <ErrorNotice error={course.error} onRetry={course.reload} />
    {course.data && <>
      {course.data.banner_url && <img className="course-detail-banner" src={course.data.banner_url} alt="" />}
      <CourseDetails detail={course.data} />
    </>}
  </section>
}
