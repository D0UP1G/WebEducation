import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'

export function StudentProfilePage() {
  const courses = useResource('student-profile-courses', api.student.allCourses)
  const items = courses.data ?? []
  const totals = items.reduce((result, course) => ({
    steps: result.steps + course.progress.total_steps,
    completed: result.completed + course.progress.completed_steps,
    points: result.points + course.progress.earned_points,
    possiblePoints: result.possiblePoints + course.progress.available_points,
  }), { steps: 0, completed: 0, points: 0, possiblePoints: 0 })
  const remaining = Math.max(totals.steps - totals.completed, 0)
  const completion = totals.steps ? Math.round(totals.completed / totals.steps * 100) : 0

  return <section className="student-profile">
    <div className="page-title"><div><p className="page-eyebrow">Твой кабинет</p><h1>Профиль и прогресс</h1><p>Здесь собраны результаты по назначенным курсам.</p></div></div>
    {courses.loading && <Loading />}
    <ErrorNotice error={courses.error} onRetry={courses.reload} />
    {courses.data && <>
      <section className="card profile-summary" aria-labelledby="profile-summary-heading">
        <h2 id="profile-summary-heading">Общий результат</h2>
        <div className="profile-stats">
          <div><span>Курсы</span><strong>{items.length}</strong></div>
          <div><span>Завершено шагов</span><strong>{totals.completed}</strong></div>
          <div><span>Осталось шагов</span><strong>{remaining}</strong></div>
          <div><span>Баллы</span><strong>{totals.points} из {totals.possiblePoints}</strong></div>
        </div>
        <div className="profile-overall-progress"><div><strong>Выполнение курсов</strong><strong>{completion}%</strong></div><progress value={completion} max={100} aria-label={`Общий прогресс ${completion}%`} /></div>
      </section>
      <section aria-labelledby="profile-courses-heading">
        <div className="route-heading"><h2 id="profile-courses-heading">Прогресс по курсам</h2><Link to="/student/courses">Все курсы</Link></div>
        {items.length === 0 ? <p className="card">Курсов пока нет. Когда появится первое назначение, статистика отобразится здесь.</p> : <div className="profile-course-list">
          {items.map((course) => <Link className="card profile-course-row" key={course.id} to={`/student/courses/${course.id}`}>
            <span><strong>{course.title}</strong><small>{course.progress.completed_steps} из {course.progress.total_steps} шагов · {course.progress.earned_points} из {course.progress.available_points} баллов</small></span>
            <progress value={course.progress.completion_percent} max={100} aria-label={`${course.title}: ${course.progress.completion_percent}%`} />
            <strong className="numeric">{course.progress.completion_percent}%</strong>
          </Link>)}
        </div>}
      </section>
    </>}
  </section>
}
