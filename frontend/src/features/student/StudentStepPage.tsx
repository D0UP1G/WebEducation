import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { StepContent } from './StepContent'
import { SubmissionPanel } from './SubmissionPanel'
import { QuestionsPanel } from './QuestionsPanel'

export function StudentStepPage() {
  const { enrollmentId = '', stepId = '' } = useParams()
  const step = useResource(`step:${enrollmentId}:${stepId}`, () => api.student.step(enrollmentId, stepId))
  const progress = useResource(`progress:${enrollmentId}`, () => api.student.progress(enrollmentId))
  const row = progress.data?.steps.find((item) => item.step_id === stepId)

  return <section>
    <p><Link to={`/student/courses/${enrollmentId}`}>← К содержанию курса</Link></p>
    {step.loading && <Loading />}
    <ErrorNotice error={step.error} onRetry={step.reload} />
    {step.data && <>
      <h1>{step.data.title}</h1>
      <p>Шаг {step.data.position} · До {step.data.max_score} баллов</p>
      {row && <p>Состояние: <Status value={row.status} /></p>}
      {progress.loading && <Loading />}
      <ErrorNotice error={progress.error} onRetry={progress.reload} />
      <div className="card"><StepContent step={step.data} /></div>
      <SubmissionPanel key={stepId} enrollmentId={enrollmentId} step={step.data} accepted={row?.status === 'accepted'} disabled={!progress.data} onUpdated={progress.reload} />
      {row?.status === 'accepted' && progress.data?.next_step_id && progress.data.next_step_id !== stepId &&
        <p><Link to={`/student/courses/${enrollmentId}/steps/${progress.data.next_step_id}`}>Перейти к следующему шагу</Link></p>}
      <QuestionsPanel key={`${stepId}-questions`} enrollmentId={enrollmentId} stepId={stepId} />
    </>}
  </section>
}
