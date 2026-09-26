import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import type { AdminEnrollment } from '../../api/types'

export function AdminAssignmentsPage() {
  const courses = useResource('assignment-courses', api.admin.allCourses)
  const students = useResource('assignment-students', () => api.admin.users('student'))
  const curators = useResource('assignment-curators', () => api.admin.users('curator'))
  const assignments = useResource('assignments', api.admin.allEnrollments)
  const [courseId, setCourseId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [curatorId, setCuratorId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [curatorSearch, setCuratorSearch] = useState('')
  const [courseSearch, setCourseSearch] = useState('')
  const draftCourses = courses.data?.filter((item) => !item.latest_version && !item.is_archived) ?? []
  const visibleStudents = useMemo(() => {
    return (students.data ?? [])
      .filter((student) => student.display_name.toLocaleLowerCase().includes(studentSearch.toLocaleLowerCase()))
      .map((student) => ({
        student,
        enrollments: (assignments.data ?? []).filter((item) => item.student.id === student.id
          && item.curator.display_name.toLocaleLowerCase().includes(curatorSearch.toLocaleLowerCase())
          && item.revision.title.toLocaleLowerCase().includes(courseSearch.toLocaleLowerCase())),
      }))
      .filter((group) => !(curatorSearch || courseSearch) || group.enrollments.length > 0)
      .sort((a, b) => a.student.display_name.localeCompare(b.student.display_name, 'ru'))
  }, [students.data, assignments.data, studentSearch, curatorSearch, courseSearch])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.assign(courseId, studentId, curatorId)
      assignments.reload()
      setMessage('Курс назначен')
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  async function update(item: AdminEnrollment, status: 'active' | 'paused' | 'completed' | 'removed', curator: string) {
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

  async function remove(item: AdminEnrollment) {
    if (!window.confirm(`Снять курс «${item.revision.title}» у ученика ${item.student.display_name}? Прогресс и история работ сохранятся.`)) return
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.updateEnrollment(item.id, { status: 'removed' })
      assignments.reload()
      setMessage(`Курс «${item.revision.title}» снят. История ученика сохранена.`)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section>
    <div className="page-title"><div><h1>Назначения</h1><p>Выберите опубликованный курс, ученика и куратора.</p></div></div>
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    <div className="assignment-layout">
    <form className="card form-stack assignment-form" onSubmit={submit}>
      <h2>Новое назначение</h2>
      <ErrorNotice error={courses.error} onRetry={courses.reload} />
      <ErrorNotice error={students.error} onRetry={students.reload} />
      <ErrorNotice error={curators.error} onRetry={curators.reload} />
      <label>Опубликованный курс<select required value={courseId} onChange={(event) => setCourseId(event.target.value)}>
        <option value="">Выберите курс</option>
        {courses.data?.filter((item) => !item.is_archived).map((item) => item.latest_version
          ? <option key={item.id} value={item.id}>{item.title} · версия {item.latest_version}</option>
          : <option key={item.id} value={item.id} disabled>{item.title} · сначала опубликуйте</option>)}
      </select></label>
      {draftCourses.length > 0 && <p className="notice info">Черновой курс нельзя назначить: добавьте теорию и контрольный вопрос, затем опубликуйте версию. {draftCourses.map((course, index) => <span key={course.id}>{index > 0 && ', '}<Link to={`/admin/courses/${course.id}/edit`}>{course.title}</Link></span>)}</p>}
      <label>Ученик<select required value={studentId} onChange={(event) => setStudentId(event.target.value)}>
        <option value="">Выберите ученика</option>
        {students.data?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
      </select></label>
      <label>Куратор<select required value={curatorId} onChange={(event) => setCuratorId(event.target.value)}>
        <option value="">Выберите куратора</option>
        {curators.data?.map((item) => <option key={item.id} value={item.id}>{item.display_name}</option>)}
      </select></label>
      <button disabled={busy || !courseId || !studentId || !curatorId}>Назначить курс</button>
    </form>
    <section className="card assignment-list" aria-labelledby="assignments-title">
      <h2 id="assignments-title">Последние назначения</h2>
      {assignments.loading && <Loading />}
      <ErrorNotice error={assignments.error} onRetry={assignments.reload} />
      <div className="assignment-searches">
        <label>Поиск ученика<input value={studentSearch} onChange={(event) => setStudentSearch(event.target.value)} placeholder="Имя ученика" /></label>
        <label>Поиск куратора<input value={curatorSearch} onChange={(event) => setCuratorSearch(event.target.value)} placeholder="Имя куратора" /></label>
        <label>Поиск курса<input value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} placeholder="Название курса" /></label>
      </div>
      {students.loading && <Loading />}
      {students.data?.length === 0 && <p>Учеников пока нет.</p>}
      {students.data?.length && visibleStudents.length === 0 && <p>По этим фильтрам учеников не найдено.</p>}
      {visibleStudents.map((group) => <article className="assignment-student-group" key={group.student.id}>
        <h3>{group.student.display_name}</h3>
        <div className="assignment-student-courses">{group.enrollments.length === 0 ? <p className="muted-text">Курсы пока не назначены.</p> : group.enrollments.map((item) => <AssignmentItem key={item.id} item={item} curators={curators.data ?? []} disabled={busy} onSave={update} onRemove={remove} />)}</div>
      </article>)}
    </section>
    </div>
  </section>
}

function AssignmentItem({ item, curators, disabled, onSave, onRemove }: {
  item: AdminEnrollment
  curators: Array<{ id: string; display_name: string }>
  disabled: boolean
  onSave: (item: AdminEnrollment, status: 'active' | 'paused' | 'completed' | 'removed', curatorId: string) => void
  onRemove: (item: AdminEnrollment) => void
}) {
  const [status, setStatus] = useState(item.status)
  const [curatorId, setCuratorId] = useState(item.curator.id)
  const [editing, setEditing] = useState(false)
  useEffect(() => { setStatus(item.status); setCuratorId(item.curator.id) }, [item.status, item.curator.id])
  const statusLabel = status === 'active' ? 'В процессе' : status === 'paused' ? 'Приостановлено' : status === 'removed' ? 'Снято' : 'Завершено'
  return <article className="assignment-item">
    <div className="assignment-row">
      <span className="assignment-person"><strong>{item.revision.title}</strong><small>Куратор: {item.curator.display_name} · версия {item.revision.version}</small></span>
      <span className={`assignment-status ${status}`}>{statusLabel}</span>
      <button type="button" className="secondary-link assignment-edit" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{editing ? 'Скрыть' : 'Изменить'}</button>
    </div>
    {editing && <div className="field-row assignment-controls">
      <label>Куратор<select value={curatorId} onChange={(event) => setCuratorId(event.target.value)}>
          {curators.map((user) => <option key={user.id} value={user.id}>{user.display_name}</option>)}
        </select></label>
      <label>Состояние<select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="active">Активно</option><option value="paused">Приостановлено</option><option value="completed">Завершено</option>
          <option value="removed">Снято</option>
        </select></label>
      <button type="button" disabled={disabled || (status === item.status && curatorId === item.curator.id)} onClick={() => onSave(item, status as 'active' | 'paused' | 'completed' | 'removed', curatorId)}>Сохранить</button>
      {status !== 'removed' && <button type="button" className="button-danger" disabled={disabled} onClick={() => onRemove(item)}>Снять курс</button>}
    </div>}
  </article>
}
