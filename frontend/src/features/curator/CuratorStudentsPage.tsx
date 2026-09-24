import { useState } from 'react'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { useResource } from '../../hooks/useResource'
import { usePagedResource } from '../../hooks/usePagedResource'

export function CuratorStudentsPage() {
  const students = usePagedResource('curator-students', api.curator.students)
  return <section>
    <div className="page-title"><div><h1>Мои ученики</h1><p>Прогресс и признаки застоя по закреплённым ученикам.</p></div>
      {students.data && <span className="queue-count">Учеников: {students.data.meta.total}</span>}
    </div>
    {students.loading && <Loading />}
    <ErrorNotice error={students.error} onRetry={students.reload} />
    {students.data?.data.length === 0 && <p>Закреплённых учеников пока нет.</p>}
    {students.data?.data.map((student) => <article className="card student-overview" key={student.id}>
      <div className="student-overview-heading"><h2>{student.display_name}</h2>
        <span className={student.lag_signals?.length ? 'student-alert' : 'student-ok'}>{student.lag_signals?.length ? 'Нужно внимание' : 'Идёт по плану'}</span>
      </div>
      {student.lag_signals?.length ? <ul className="student-signals">{student.lag_signals.map((signal, index) =>
        <li key={`${signal.code ?? 'lag'}-${index}`}>{signal.reason ?? signal.code ?? 'Требуется внимание'}{signal.since && ` · с ${new Date(signal.since).toLocaleString('ru-RU')}`}</li>)}</ul> : <p>Признаков застоя нет.</p>}
      {student.enrollments?.map((enrollment) => <StudentProgress key={enrollment.id} studentId={student.id} enrollmentId={enrollment.id} title={enrollment.title} />)}
    </article>)}
    <Pagination meta={students.data?.meta} page={students.page} onPage={students.setPage} />
  </section>
}

function StudentProgress({ studentId, enrollmentId, title }: { studentId: string; enrollmentId: string; title?: string }) {
  const [open, setOpen] = useState(false)
  const progress = useResource(`curator-progress:${studentId}:${enrollmentId}:${open}`, () =>
    open ? api.curator.studentProgress(studentId, enrollmentId) : Promise.resolve(null))
  return <div className="student-enrollment">
    <button type="button" onClick={() => setOpen((value) => !value)}>{open ? 'Скрыть' : 'Показать'} прогресс: {title ?? 'курс'}</button>
    {open && <>
      {progress.loading && <Loading />}
      <ErrorNotice error={progress.error} onRetry={progress.reload} />
      {progress.data && <>
        <p>{progress.data.completed_steps} из {progress.data.total_steps} шагов · {progress.data.earned_points} / {progress.data.available_points} баллов</p>
        <ol>{progress.data.steps.map((step) => <li key={step.step_id}>{step.title}: <Status value={step.status} /></li>)}</ol>
      </>}
    </>}
  </div>
}
