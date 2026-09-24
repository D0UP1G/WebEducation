import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

export function StudentCoursePage() {
  const { enrollmentId = '' } = useParams()
  const course = useResource(`enrollment:${enrollmentId}`, () => api.student.enrollment(enrollmentId))
  return (
    <section>
      <p><Link to="/student/courses">← Мои курсы</Link></p>
      {course.loading && <Loading />}
      <ErrorNotice error={course.error} onRetry={course.reload} />
      {course.data && <>
        <h1>{course.data.title}</h1>
        <EnrollmentStatusNotice status={course.data.status} />
        <p>{course.data.description}</p>
        <p>Версия курса: {course.data.version}. Завершено {course.data.progress.completed_steps} из {course.data.progress.total_steps} шагов.</p>
        <progress value={course.data.progress.completion_percent} max={100} aria-label="Процент завершения" />
        <p>Баллы: {course.data.progress.earned_points} / {course.data.progress.available_points} ({course.data.progress.rating_percent}%)</p>
        {course.data.progress.next_step_id && <p><Link to={`/student/courses/${enrollmentId}/steps/${course.data.progress.next_step_id}`}>Следующий шаг</Link></p>}
        {course.data.progress.next_action === 'await_review' && <p>Работа проверяется куратором.</p>}
        {course.data.progress.next_action === 'course_complete' && <p>Курс завершён.</p>}
        <h2>Шаги</h2>
        <ol className="step-list">
          {course.data.steps.map((step) => {
            const progress = course.data?.progress.steps.find((item) => item.step_id === step.id)
            return <li key={step.id}>
              <Link to={`/student/courses/${enrollmentId}/steps/${step.id}`}>{step.title}</Link>
              <span>{progress && <Status value={progress.status} />} · {progress?.earned_points ?? 0} / {step.max_score} баллов</span>
            </li>
          })}
        </ol>
      </>}
    </section>
  )
}
