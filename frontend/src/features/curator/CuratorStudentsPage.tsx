import { Fragment, useId, useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { CuratorStudent, Progress } from '../../api/types'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { useResource } from '../../hooks/useResource'
import { usePagedResource } from '../../hooks/usePagedResource'

type Enrollment = NonNullable<CuratorStudent['enrollments']>[number]

export function CuratorStudentsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const students = usePagedResource(`curator-students:${search}`, (page) => api.curator.students(page, search))

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    students.setPage(1)
    setSearch(searchInput.trim())
  }

  function clearSearch() {
    setSearchInput('')
    students.setPage(1)
    setSearch('')
  }

  return <section>
    <div className="page-title"><div><h1>Мои ученики</h1><p>Прогресс и признаки застоя по закреплённым ученикам.</p></div>
      {students.data && <span className="queue-count">Учеников: {students.data.meta.total}</span>}
    </div>
    <form className="curator-student-search" role="search" onSubmit={submitSearch}>
      <label htmlFor="curator-student-search">Поиск ученика</label>
      <div>
        <input id="curator-student-search" type="search" placeholder="Имя или логин" value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)} />
        <button type="submit">Найти</button>
        {(search || searchInput) && <button className="button-secondary" type="button" onClick={clearSearch}>Сбросить</button>}
      </div>
    </form>
    {students.loading && <Loading />}
    <ErrorNotice error={students.error} onRetry={students.reload} />
    {students.data && <section className="card queue-card" aria-labelledby="student-list-title">
      <div className="queue-card-head"><h2 id="student-list-title">Закреплённые ученики</h2><p>{students.data.meta.total} в списке</p></div>
      {students.data.data.length === 0
        ? <p className="table-empty">{search ? 'По запросу ученики не найдены.' : 'Закреплённых учеников пока нет.'}</p>
        : <div className="table-scroll"><table className="data-table student-table">
          <thead><tr><th scope="col">Ученик</th><th scope="col">Курсов</th><th scope="col">Сигнал</th><th scope="col"><span className="visually-hidden">Действие</span></th></tr></thead>
          <tbody>{students.data.data.map((student) => <StudentRow key={student.id} student={student} />)}</tbody>
        </table></div>}
    </section>}
    <Pagination meta={students.data?.meta} page={students.page} onPage={students.setPage} />
  </section>
}

function StudentRow({ student }: { student: CuratorStudent }) {
  const [open, setOpen] = useState(false)
  const coursesId = useId()
  const enrollments = student.enrollments ?? []
  const signals = student.lag_signals ?? []
  const paceKnown = student.lag_signals !== undefined

  return <Fragment>
    <tr>
      <td><strong>{student.display_name}</strong><small>Ученик</small></td>
      <td className="numeric">{enrollments.length}</td>
      <td><span className={`pace-label ${signals.length ? 'pace-needs-attention' : paceKnown ? 'pace-on-track' : 'pace-unknown'}`}>
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {signals.length ? <><path d="M10 2 2 17h16L10 2Z" /><path d="M10 7v4M10 14h.01" /></> : paceKnown ? <><circle cx="10" cy="10" r="8" /><path d="m6 10 3 3 5-6" /></> : <><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6h.01" /></>}
        </svg>{signals.length ? 'Нужно внимание' : paceKnown ? 'В графике' : 'Нет данных'}</span>
      </td>
      <td><button className="secondary-link" type="button" aria-expanded={open} aria-controls={coursesId}
        onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть курсы' : 'Показать курсы'}</button></td>
    </tr>
    {open && <tr className="student-detail-row"><td colSpan={4}>
      <div id={coursesId} className="student-courses">
        {enrollments.length === 0 ? <p>Курсы пока не назначены.</p> : enrollments.map((enrollment) =>
          <StudentCourse key={enrollment.id} studentId={student.id} enrollment={enrollment}
            fallbackProgress={enrollments.length === 1 ? student.progress : undefined} />)}
      </div>
    </td></tr>}
  </Fragment>
}

function StudentCourse({ studentId, enrollment, fallbackProgress }: {
  studentId: string
  enrollment: Enrollment
  fallbackProgress?: Progress
}) {
  const [open, setOpen] = useState(false)
  const progressId = useId()
  const detail = useResource(`curator-progress:${studentId}:${enrollment.id}:${open}`, () =>
    open ? api.curator.studentProgress(studentId, enrollment.id) : Promise.resolve(null))
  const summary = enrollment.progress ?? fallbackProgress

  return <article className="student-course">
    <div className="student-course-head">
      <div><h3>{enrollment.title ?? 'Курс'}</h3>
        <p>{summary ? `${summary.completed_steps} из ${summary.total_steps} шагов · ${summary.earned_points} из ${summary.available_points} баллов` : 'Прогресс пока недоступен'}</p></div>
      <button className="secondary-link" type="button" aria-expanded={open} aria-controls={progressId}
        onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть прогресс' : 'Показать прогресс'}</button>
    </div>
    {open && <div id={progressId} className="student-course-progress">
      {detail.loading && <Loading />}
      <ErrorNotice error={detail.error} onRetry={detail.reload} />
      {detail.data && <>
        {detail.data.lag_signals && detail.data.lag_signals.length > 0 && <ul className="student-signals">{detail.data.lag_signals.map((signal, index) =>
          <li key={`${signal.code ?? 'lag'}-${index}`}>{signal.reason ?? signal.code ?? 'Требуется внимание'}{signal.since && ` · с ${new Date(signal.since).toLocaleString('ru-RU')}`}</li>)}</ul>}
        <ol className="student-step-progress">{detail.data.steps.map((step) => <li key={step.step_id}><span>{step.title}</span><Status value={step.status} /></li>)}</ol>
      </>}
    </div>}
  </article>
}
