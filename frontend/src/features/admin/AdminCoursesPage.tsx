import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
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
  const [message, setMessage] = useState('')

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

  async function removeOrArchive(course: NonNullable<typeof courses.data>['data'][number]) {
    const message = course.latest_version
      ? `У курса «${course.title}» есть опубликованная версия. Он будет архивирован, чтобы сохранить учебную историю учеников. Продолжить?`
      : `Удалить черновой курс «${course.title}»? Это действие нельзя отменить.`
    if (!window.confirm(message)) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.admin.deleteCourse(course.id)
      courses.reload()
      setMessage(result.archived ? `Курс «${course.title}» архивирован. История учеников сохранена.` : `Курс «${course.title}» удалён.`)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  async function restore(course: NonNullable<typeof courses.data>['data'][number]) {
    setBusy(true)
    setError(null)
    try {
      await api.admin.updateCourse(course.id, { is_archived: false })
      courses.reload()
      setMessage(`Курс «${course.title}» восстановлен.`)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section>
    <div className="page-title"><div><h1>Курсы</h1><p>Черновики, опубликованные версии и новые курсы.</p></div>
      {courses.data && <span className="queue-count">Курсов: {courses.data.meta.total}</span>}
    </div>
    {message && <InfoNotice>{message}</InfoNotice>}
    <div className="course-index-layout">
      <section className="card course-index" aria-labelledby="course-index-title">
        <h2 id="course-index-title">Список курсов</h2>
        {courses.loading && <Loading />}
        <ErrorNotice error={courses.error} onRetry={courses.reload} />
        {courses.data?.data.length === 0 && <p>Курсов пока нет.</p>}
        {courses.data?.data.map((course) => <article className={`course-index-row ${course.is_archived ? 'archived' : ''}`} key={course.id}>
          <div><h3>{course.title}</h3><p>{course.description}</p>
            <small>{course.is_archived ? 'Архивирован' : course.latest_version ? `Опубликована версия ${course.latest_version}` : 'Ещё не опубликован'} · Черновых шагов: {course.draft_steps_count ?? '—'}</small></div>
          <div className="course-row-actions">
            <Link className="secondary-link" to={`/admin/courses/${course.id}/edit`}>Редактировать</Link>
            {course.is_archived
              ? <button type="button" className="button-secondary" disabled={busy} onClick={() => restore(course)}>Восстановить</button>
              : <button type="button" className="button-danger" disabled={busy} onClick={() => removeOrArchive(course)}>Удалить</button>}
          </div>
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
