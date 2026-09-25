import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { StudentCourse } from '../../api/types'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { usePagedResource } from '../../hooks/usePagedResource'
import { useResource } from '../../hooks/useResource'
import { CourseRoute, CourseScoreCard, stepTypeLabel } from './CourseRoute'

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

export function StudentHomePage() {
  const courses = usePagedResource('student-home-courses', api.student.courses)
  const featured = courses.data?.data.find((course) => course.status === 'active' && course.progress.next_step_id)
  return <section className="student-home">
    <div className="page-title"><div><p className="page-eyebrow">Твой кабинет</p><h1>Привет!</h1>
      {featured && <p>Ты прошёл {featured.progress.completed_steps} из {featured.progress.total_steps} шагов. Следующий уже ждёт тебя.</p>}
    </div><Link className="secondary-link" to="/student/courses">Все курсы</Link></div>
    {courses.loading && <Loading />}
    <ErrorNotice error={courses.error} onRetry={courses.reload} />
    {featured ? <FeaturedCourse featured={featured} /> : courses.data?.data.length === 0 ? <section className="card empty-courses"><h2>Начни свой учебный маршрут</h2><p>Пока тебе не назначили курс. Когда он появится, мы покажем здесь следующий шаг.</p></section> : null}
    {courses.data?.data.length ? <p className="home-progress-link"><Link to="/student/profile">Посмотреть статистику и профиль →</Link></p> : null}
  </section>
}
