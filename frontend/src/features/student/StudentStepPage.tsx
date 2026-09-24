import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, Loading, Status } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import { StepContent } from './StepContent'
import { SubmissionPanel } from './SubmissionPanel'
import { QuestionsPanel } from './QuestionsPanel'
import { CourseRoute, checkSource } from './CourseRoute'
import { EnrollmentStatusNotice } from './EnrollmentStatusNotice'

export function StudentStepPage() {
  const { enrollmentId = '', stepId = '' } = useParams()
  const step = useResource(`step:${enrollmentId}:${stepId}`, () => api.student.step(enrollmentId, stepId))
  const enrollment = useResource(`enrollment:${enrollmentId}`, () => api.student.enrollment(enrollmentId))
  const progress = enrollment.data?.progress
  const row = progress?.steps.find((item) => item.step_id === stepId)

  return <section>
    {step.loading && <Loading />}
    <ErrorNotice error={step.error} onRetry={step.reload} />
    {step.data && <>
      <div className="page-title">
        <div>
          <p className="page-eyebrow">{enrollment.data?.title ?? 'Курс'} · шаг {step.data.position} из {progress?.total_steps ?? '—'}</p>
          <h1>{step.data.title}</h1>
          <p>До {step.data.max_score} баллов за шаг</p>
        </div>
        {row && <Status value={row.status} source={row.status === 'accepted' ? checkSource(step.data.type_key) : undefined} />}
      </div>
      {enrollment.loading && <Loading />}
      <ErrorNotice error={enrollment.error} onRetry={enrollment.reload} />
      {enrollment.data && <EnrollmentStatusNotice status={enrollment.data.status} />}
      <div className="student-step-layout">
        <div className="student-step-main">
          <div className="card step-content-card"><h2>Задание</h2><StepContent step={step.data} /></div>
          <SubmissionPanel key={stepId} enrollmentId={enrollmentId} step={step.data} accepted={row?.status === 'accepted'} disabled={enrollment.data?.status !== 'active'} onUpdated={enrollment.reload} />
          <QuestionsPanel key={`${stepId}-questions`} enrollmentId={enrollmentId} stepId={stepId} />
        </div>
        {enrollment.data && <CourseRoute detail={enrollment.data} compact currentStepId={stepId} />}
      </div>
      {row?.status === 'accepted' && progress?.next_step_id && progress.next_step_id !== stepId &&
        <p><Link className="action-link" to={`/student/courses/${enrollmentId}/steps/${progress.next_step_id}`}>Перейти к следующему шагу</Link></p>}
    </>}
  </section>
}
