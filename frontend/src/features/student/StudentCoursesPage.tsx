import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { StudentCourse } from '../../api/types'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import { useResource } from '../../hooks/useResource'
import { CourseRoute, CourseScoreCard, stepTypeLabel } from './CourseRoute'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

function FeaturedCourse({ featured }: { featured: StudentCourse }) {
  const detail = useResource(`enrollment:${featured.id}`, () => api.student.enrollment(featured.id))
  const next = detail.data?.steps.find((step) => step.id === featured.progress.next_step_id)
  return <>
    <div className="student-dashboard">
      <section className="course-hero" aria-label="Следующий шаг">
        <div className="hero-meta"><span>Следующий шаг{next ? ` · ${next.position} из ${featured.progress.total_steps}` : ''}</span>{next && <span>{stepTypeLabel(next.type_key)}</span>}</div>
        <h2>{next?.title ?? (featured.progress.next_action === 'revise_submission' ? 'Доработай задание' : 'Продолжай курс')}</h2>
        <p>{featured.progress.next_action === 'revise_submission' ? 'Посмотри комментарий и попробуй ещё раз.' : 'Открой задание и двигайся дальше.'}</p>
        <p className="hero-context">Курс «{featured.title}»</p>
        <Link className="action-link" to={`/student/courses/${featured.id}/steps/${featured.progress.next_step_id}`}>Продолжить →</Link>
      </section>
      {detail.data ? <CourseScoreCard detail={detail.data} /> : <div className="card score-card">
        <h2>Твой результат</h2>
        {detail.loading && <Loading />}
        <ErrorNotice error={detail.error} onRetry={detail.reload} />
      </div>}
    </div>
    {detail.data && <CourseRoute detail={detail.data} />}
  </>
}

export function StudentCoursesPage() {
  const courses = usePagedResource('student-courses', api.student.courses)
  const featured = courses.data?.data.find((course) => course.status === 'active' && course.progress.next_step_id)
  return (
    <section className="student-home">
      <div className="page-title"><div><h1>Мои курсы</h1>
        {featured && <p>Ты прошёл {featured.progress.completed_steps} из {featured.progress.total_steps} шагов. Следующий уже ждёт тебя.</p>}
      </div></div>
      {courses.loading && <Loading />}
      <ErrorNotice error={courses.error} onRetry={courses.reload} />
      {courses.data?.data.length === 0 && <p>Пока нет назначенных курсов.</p>}
      {featured && <FeaturedCourse featured={featured} />}
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
