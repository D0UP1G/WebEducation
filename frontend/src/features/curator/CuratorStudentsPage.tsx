import { Fragment, useState } from 'react'
import { api } from '../../api'
import type { CuratorStudent, Progress } from '../../api/types'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { useResource } from '../../hooks/useResource'
import { usePagedResource } from '../../hooks/usePagedResource'

type Enrollment = NonNullable<CuratorStudent['enrollments']>[number]

export function CuratorStudentsPage() {
  const students = usePagedResource('curator-students', api.curator.students)
  return <section>
    <div className="page-title"><div><h1>Мои ученики</h1><p>Прогресс и признаки застоя по закреплённым ученикам.</p></div>
      {students.data && <span className="queue-count">Учеников: {students.data.meta.total}</span>}
    </div>
    {students.loading && <Loading />}
    <ErrorNotice error={students.error} onRetry={students.reload} />
    {students.data && <section className="card queue-card" aria-labelledby="student-list-title">
      <div className="queue-card-head"><h2 id="student-list-title">Закреплённые ученики</h2><p>{students.data.meta.total} в списке</p></div>
      {students.data.data.length === 0
        ? <p className="table-empty">Закреплённых учеников пока нет.</p>
        : <div className="table-scroll"><table className="data-table student-table">
          <thead><tr><th scope="col">Ученик</th><th scope="col">Курс</th><th scope="col">Шаги</th><th scope="col">Сигнал</th><th scope="col"><span className="visually-hidden">Действие</span></th></tr></thead>
          <tbody>{students.data.data.flatMap((student) => {
            const enrollments = student.enrollments?.length ? student.enrollments : [null]
            return enrollments.map((enrollment) => <StudentRow key={`${student.id}:${enrollment?.id ?? 'none'}`} student={student} enrollment={enrollment} />)
          })}</tbody>
        </table></div>}
    </section>}
    <Pagination meta={students.data?.meta} page={students.page} onPage={students.setPage} />
  </section>
}

function StudentRow({ student, enrollment }: { student: CuratorStudent; enrollment: Enrollment | null }) {
  const [open, setOpen] = useState(false)
  const detail = useResource(`curator-progress:${student.id}:${enrollment?.id ?? 'none'}:${open}`, () =>
    open && enrollment ? api.curator.studentProgress(student.id, enrollment.id) : Promise.resolve(null))
  const summary: Progress | undefined = enrollment?.progress ?? (student.enrollments?.length === 1 ? student.progress : undefined)
  const signals = student.lag_signals ?? []
  const paceKnown = student.lag_signals !== undefined
  return <Fragment>
    <tr>
      <td><strong>{student.display_name}</strong><small>Ученик</small></td>
      <td><strong>{enrollment?.title ?? 'Курс не назначен'}</strong></td>
      <td className="numeric">{summary ? `${summary.completed_steps} из ${summary.total_steps}` : '—'}</td>
      <td><span className={`pace-label ${signals.length ? 'pace-needs-attention' : paceKnown ? 'pace-on-track' : 'pace-unknown'}`}>
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {signals.length ? <><path d="M10 2 2 17h16L10 2Z" /><path d="M10 7v4M10 14h.01" /></> : paceKnown ? <><circle cx="10" cy="10" r="8" /><path d="m6 10 3 3 5-6" /></> : <><circle cx="10" cy="10" r="8" /><path d="M10 9v5M10 6h.01" /></>}
        </svg>{signals.length ? 'Нужно внимание' : paceKnown ? 'В графике' : 'Нет данных'}</span>
        {signals[0]?.reason && <small>{signals[0].reason}</small>}
      </td>
      <td>{enrollment && <button className="secondary-link" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть' : 'Открыть'}</button>}</td>
    </tr>
    {open && enrollment && <tr className="student-detail-row"><td colSpan={5}>
      <div className="student-detail-content">
        <h3>Прогресс · {enrollment.title ?? 'курс'}</h3>
        {signals.length > 0 && <ul className="student-signals">{signals.map((signal, index) =>
          <li key={`${signal.code ?? 'lag'}-${index}`}>{signal.reason ?? signal.code ?? 'Требуется внимание'}{signal.since && ` · с ${new Date(signal.since).toLocaleString('ru-RU')}`}</li>)}</ul>}
        {detail.loading && <Loading />}
        <ErrorNotice error={detail.error} onRetry={detail.reload} />
        {detail.data && <>
          <p>{detail.data.completed_steps} из {detail.data.total_steps} шагов · {detail.data.earned_points} из {detail.data.available_points} баллов</p>
          <ol className="student-step-progress">{detail.data.steps.map((step) => <li key={step.step_id}><span>{step.title}</span><Status value={step.status} /></li>)}</ol>
        </>}
      </div>
    </td></tr>}
  </Fragment>
}
