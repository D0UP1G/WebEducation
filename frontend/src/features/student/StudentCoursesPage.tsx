import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { StudentCourse } from '../../api/types'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

const stepPlural = new Intl.PluralRules('ru-RU')
function stepLabel(value: number) {
  const plural = stepPlural.select(value)
  return plural === 'one' ? 'шаг' : plural === 'few' ? 'шага' : 'шагов'
}

function CourseProgressRows({ course }: { course: StudentCourse }) {
  const remaining = Math.max(course.progress.total_steps - course.progress.completed_steps, 0)
  return <div className="course-progress-summary" aria-label={`Прогресс курса ${course.title}`}>
    <div><span>Завершено</span><strong>{course.progress.completed_steps} {stepLabel(course.progress.completed_steps)}</strong></div>
    <div><span>Осталось</span><strong>{remaining} {stepLabel(remaining)}</strong></div>
    <div><span>Прогресс</span><strong>{course.progress.completion_percent}%</strong></div>
    <progress value={course.progress.completion_percent} max={100} aria-label={`${course.progress.completion_percent}% курса ${course.title}`} />
  </div>
}

export function StudentCoursesPage() {
  const courses = usePagedResource('student-courses', api.student.courses)
  return <section className="student-course-catalog">
    <div className="page-title"><div><p className="page-eyebrow">Твой учебный маршрут</p><h1>Мои курсы</h1><p>Выбери курс, чтобы посмотреть программу и продолжить занятия.</p></div>
      {courses.data && <span className="queue-count">Курсов: {courses.data.meta.total}</span>}
    </div>
    {courses.loading && <Loading />}
    <ErrorNotice error={courses.error} onRetry={courses.reload} />
    {courses.data?.data.length === 0 && <div className="card empty-courses"><h2>Пока нет назначенных курсов</h2><p>Когда администратор добавит курс, он появится здесь.</p></div>}
    <div className="card-grid">
      {courses.data?.data.map((course) => (
        <Link className="card course-card course-card-link" key={course.id} to={`/student/courses/${course.id}`} aria-label={`Открыть курс ${course.title}`}>
          {course.banner_url && <img className="course-card-banner" src={course.banner_url} alt="" loading="lazy" />}
          <span className="course-card-topline"><span>{course.tool || 'Образовательный курс'}</span><span className={`course-card-status ${course.status}`}>{course.status === 'active' ? 'В процессе' : course.status === 'paused' ? 'Приостановлен' : 'Завершён'}</span></span>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
          {course.status === 'paused' && <span className="course-card-status-copy">Назначение приостановлено. Можно смотреть курс, но сдавать шаги пока нельзя.</span>}
          {course.status === 'completed' && <span className="course-card-status-copy">Назначение завершено. Курс и результаты доступны для просмотра.</span>}
          <CourseProgressRows course={course} />
          <p className="course-points">Баллы: {course.progress.earned_points} из {course.progress.available_points}</p>
          <span className="course-card-action">Открыть курс <span aria-hidden="true">→</span></span>
        </Link>
      ))}
    </div>
    <Pagination meta={courses.data?.meta} page={courses.page} onPage={courses.setPage} />
  </section>
}
