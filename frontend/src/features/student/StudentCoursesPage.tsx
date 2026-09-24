import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

export function StudentCoursesPage() {
  const courses = usePagedResource('student-courses', api.student.courses)
  return (
    <section>
      <h1>Мои курсы</h1>
      {courses.loading && <Loading />}
      <ErrorNotice error={courses.error} onRetry={courses.reload} />
      {courses.data?.data.length === 0 && <p>Пока нет назначенных курсов.</p>}
      <div className="card-grid">
        {courses.data?.data.map((course) => (
          <article className="card" key={course.id}>
            <h2>{course.title}</h2>
            <EnrollmentStatusNotice status={course.status} />
            <p>{course.description}</p>
            <p>Версия {course.version} · Пройдено {course.progress.completed_steps} из {course.progress.total_steps} шагов</p>
            <p>Баллы: {course.progress.earned_points} / {course.progress.available_points}</p>
            <progress value={course.progress.completion_percent} max={100} aria-label={`Прогресс курса ${course.title}`} />
            <p><Link to={`/student/courses/${course.id}`}>{course.status === 'active' ? 'Продолжить' : 'Открыть курс'}</Link></p>
          </article>
        ))}
      </div>
      <Pagination meta={courses.data?.meta} page={courses.page} onPage={courses.setPage} />
    </section>
  )
}
