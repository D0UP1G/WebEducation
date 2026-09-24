import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import type { StudentEnrollment } from '../../api/types'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { CourseRoute, CourseScoreCard } from './CourseRoute'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

function CourseDetails({ detail }: { detail: StudentEnrollment }) {
  const next = detail.steps.find((step) => step.id === detail.progress.next_step_id)
  return <>
    <div className="page-title">
      <div>
        <h1>{detail.title}</h1>
        <p>{detail.description}</p>
        <p className="muted">Версия курса: {detail.version}</p>
      </div>
      <EnrollmentStatusNotice status={detail.status} />
    </div>
    <div className="student-dashboard">
      {detail.status === 'active' && detail.progress.next_step_id && <section className="course-hero" aria-label="Следующий шаг">
        <p className="eyebrow">Следующий шаг{next ? ` · ${next.position} из ${detail.progress.total_steps}` : ''}</p>
        <h2>{next?.title ?? 'Продолжить курс'}</h2>
        <p>{detail.progress.next_action === 'revise_submission' ? 'Посмотри комментарий и попробуй ещё раз.' : 'Открой задание и двигайся дальше.'}</p>
        <Link className="action-link" to={`/student/courses/${detail.id}/steps/${detail.progress.next_step_id}`}>Продолжить →</Link>
      </section>}
      <CourseScoreCard detail={detail} />
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
    <p><Link to="/student/courses">← Мои курсы</Link></p>
    {course.loading && <Loading />}
    <ErrorNotice error={course.error} onRetry={course.reload} />
    {course.data && <CourseDetails detail={course.data} />}
  </section>
}
