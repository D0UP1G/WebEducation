import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { useResource } from '../../hooks/useResource'
import { usePagedResource } from '../../hooks/usePagedResource'
import type { AdminEnrollment } from '../../api/types'

export function AdminAssignmentsPage() {
  const courses = useResource('assignment-courses', api.admin.allCourses)
  const students = useResource('assignment-students', () => api.admin.users('student'))
  const curators = useResource('assignment-curators', () => api.admin.users('curator'))
  const assignments = usePagedResource('assignments', api.admin.enrollments)
  const [courseId, setCourseId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [curatorId, setCuratorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const draftCourses = courses.data?.filter((item) => !item.latest_version) ?? []

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.assign(courseId, studentId, curatorId)
      assignments.setPage(1)
      assignments.reload()
      setMessage('Курс назначен')
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  async function update(item: AdminEnrollment, status: string, curator: string) {
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.updateEnrollment(item.id, { status, curator_id: curator })
      assignments.reload()
      setMessage('Назначение обновлено')
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section>
    <h1>Назначения</h1>
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    <form className="card form-stack" onSubmit={submit}>
      <h2>Назначить курс</h2>
      <ErrorNotice error={courses.error} onRetry={courses.reload} />
      <ErrorNotice error={students.error} onRetry={students.reload} />
      <ErrorNotice error={curators.error} onRetry={curators.reload} />
      <label>Курс<select required value={courseId} onChange={(event) => setCourseId(event.target.value)}>
        <option value="">Выберите курс</option>
        {courses.data?.map((item) => item.latest_version
          ? <option key={item.id} value={item.id}>{item.title} · версия {item.latest_version}</option>
          : <option key={item.id} value={item.id} disabled>{item.title} · сначала опубликуйте</option>)}
      </select></label>
      {draftCourses.length > 0 && <p className="notice info">Черновой курс нельзя назначить: сначала добавьте обязательные шаги и опубликуйте версию. {draftCourses.map((course, index) => <span key={course.id}>{index > 0 && ', '}<Link to={`/admin/courses/${course.id}/edit`}>{course.title}</Link></span>)}</p>}
      <label>Ученик<select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
        <option value="">Выберите ученика</option>
        {students.data?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
      </select></label>
      <label>Куратор<select required value={curatorId} onChange={(event) => setCuratorId(event.target.value)}>
        <option value="">Выберите куратора</option>
        {curators.data?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
      </select></label>
      <button disabled={busy || !courseId || !studentId || !curatorId}>Назначить</button>
    </form>
    <h2>Текущие назначения</h2>
    {assignments.loading && <Loading />}
    <ErrorNotice error={assignments.error} onRetry={assignments.reload} />
    {assignments.data?.data.length === 0 && <p>Назначений пока нет.</p>}
    {assignments.data?.data.map((item) => <AssignmentItem key={item.id} item={item} curators={curators.data ?? []} disabled={busy} onSave={update} />)}
    <Pagination meta={assignments.data?.meta} page={assignments.page} onPage={assignments.setPage} />
  </section>
}

function AssignmentItem({ item, curators, disabled, onSave }: {
  item: AdminEnrollment
  curators: Array<{ id: string; display_name: string }>
  disabled: boolean
  onSave: (item: AdminEnrollment, status: string, curatorId: string) => void
}) {
  const [status, setStatus] = useState(item.status)
  const [curatorId, setCuratorId] = useState(item.curator.id)
  useEffect(() => { setStatus(item.status); setCuratorId(item.curator.id) }, [item.status, item.curator.id])
  return <article className="card">
    <h3>{item.revision.title} · версия {item.revision.version}</h3>
    <p>Ученик: {item.student.display_name}</p>
    <div className="field-row">
      <label>Куратор<select value={curatorId} onChange={(event) => setCuratorId(event.target.value)}>
        {curators.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
      </select></label>
      <label>Состояние<select value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="active">Активно</option><option value="paused">Приостановлено</option><option value="completed">Завершено</option>
      </select></label>
      <button type="button" disabled={disabled || (status === item.status && curatorId === item.curator.id)} onClick={() => onSave(item, status, curatorId)}>Сохранить</button>
    </div>
  </article>
}
