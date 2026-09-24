import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

export function AdminCoursesPage() {
  const navigate = useNavigate()
  const courses = usePagedResource('admin-courses', api.admin.courses)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [gradeMin, setGradeMin] = useState(1)
  const [gradeMax, setGradeMax] = useState(9)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const course = await api.admin.createCourse({ title: title.trim(), description: description.trim(), grade_min: gradeMin, grade_max: gradeMax })
      navigate(`/admin/courses/${course.id}/edit`)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section>
    <div className="page-title"><div><h1>Курсы</h1><p>Черновики, опубликованные версии и новые курсы.</p></div>
      {courses.data && <span className="queue-count">Курсов: {courses.data.meta.total}</span>}
    </div>
    <div className="course-index-layout">
      <section className="card course-index" aria-labelledby="course-index-title">
        <h2 id="course-index-title">Список курсов</h2>
        {courses.loading && <Loading />}
        <ErrorNotice error={courses.error} onRetry={courses.reload} />
        {courses.data?.data.length === 0 && <p>Курсов пока нет.</p>}
        {courses.data?.data.map((course) => <article className="course-index-row" key={course.id}>
          <div><h3>{course.title}</h3><p>{course.description}</p>
            <small>{course.latest_version ? `Опубликована версия ${course.latest_version}` : 'Ещё не опубликован'} · Черновых шагов: {course.draft_steps_count ?? '—'}</small></div>
          <Link className="secondary-link" to={`/admin/courses/${course.id}/edit`}>Редактировать</Link>
        </article>)}
        <Pagination meta={courses.data?.meta} page={courses.page} onPage={courses.setPage} />
      </section>
      <section className="card course-create">
        <h2>Новый курс</h2>
        <ErrorNotice error={error} />
        <form onSubmit={create} className="form-stack">
          <label>Название<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <div className="field-row">
            <label>Класс от<input type="number" min={1} max={9} value={gradeMin} onChange={(event) => setGradeMin(Number(event.target.value))} /></label>
            <label>Класс до<input type="number" min={gradeMin} max={9} value={gradeMax} onChange={(event) => setGradeMax(Number(event.target.value))} /></label>
          </div>
          <button disabled={busy || !title.trim()}>Создать курс</button>
        </form>
      </section>
    </div>
  </section>
}
