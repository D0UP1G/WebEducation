import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

export function StudentCoursesPage() {
  const courses = usePagedResource('student-courses', api.student.courses)
  const featured = courses.data?.data.find((course) => course.status === 'active' && course.progress.next_step_id)
  return (
    <section className="student-home">
      <h1>Мои курсы</h1>
      {courses.loading && <Loading />}
      <ErrorNotice error={courses.error} onRetry={courses.reload} />
      {courses.data?.data.length === 0 && <p>Пока нет назначенных курсов.</p>}
      {featured && <article className="course-hero" aria-label="Следующий шаг">
        <p className="eyebrow">Следующий шаг · {featured.title}</p>
        <h2>{featured.progress.next_action === 'revise_submission' ? 'Доработай задание' : 'Продолжай курс'}</h2>
        <p>Ты прошёл {featured.progress.completed_steps} из {featured.progress.total_steps} шагов. Следующий уже ждёт тебя.</p>
        <Link className="action-link" to={`/student/courses/${featured.id}/steps/${featured.progress.next_step_id}`}>Продолжить →</Link>
      </article>}
      {courses.data?.data.length ? <h2 className="section-title">Все курсы</h2> : null}
      <div className="card-grid">
        {courses.data?.data.map((course) => (
          <article className="card course-card" key={course.id}>
            <h2>{course.title}</h2>
            <EnrollmentStatusNotice status={course.status} />
            <p>{course.description}</p>
            <p>Версия {course.version} · Пройдено {course.progress.completed_steps} из {course.progress.total_steps} шагов</p>
            <p>Баллы за зачтённые шаги: {course.progress.earned_points} из {course.progress.available_points}</p>
            <progress value={course.progress.completion_percent} max={100} aria-label={`Прогресс курса ${course.title}`} />
            <p><Link to={`/student/courses/${course.id}`}>Открыть курс</Link></p>
          </article>
        ))}
      </div>
      <Pagination meta={courses.data?.meta} page={courses.page} onPage={courses.setPage} />
    </section>
  )
}
