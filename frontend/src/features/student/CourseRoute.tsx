import { Link } from 'react-router-dom'
import type { StudentEnrollment, Step, StepType } from '../../api/types'
import { Status } from '../../components/Feedback'

export function checkSource(type: StepType): 'manual' | 'automatic' | undefined {
  if (type.startsWith('artifact.')) return 'manual'
  return type === 'theory' ? undefined : 'automatic'
}

export function stepTypeLabel(type: StepType): string {
  if (type === 'theory') return 'Теория'
  if (type.startsWith('quiz.') || type === 'answer.exact') return 'Вопрос'
  if (type === 'scratch.numeric_answer' || type === 'artifact.scratch') return 'Scratch'
  if (type === 'algorithm.python') return 'Задача с тестами'
  if (type === 'artifact.minecraft') return 'Minecraft Education'
  return 'Проект'
}

export function StepIcon({ type }: { type: StepType }) {
  const path = type === 'theory'
    ? <><path d="M10 5c-2.5-2-5-2-8-1v12c3-1 5.5-1 8 1 2.5-2 5-2 8-1V4c-3-1-5.5-1-8 1Z" /><path d="M10 5v12" /></>
    : type === 'scratch.numeric_answer' || type === 'artifact.scratch'
      ? <><rect x="2" y="3" width="7" height="7" rx="1" /><rect x="11" y="3" width="7" height="7" rx="1" /><rect x="2" y="12" width="16" height="6" rx="1" /></>
      : type.startsWith('quiz.') || type === 'answer.exact'
      ? <><circle cx="10" cy="10" r="8" /><path d="M8 7a2 2 0 0 1 4 1c0 1.5-2 1.5-2 3" /><path d="M10 14h.01" /></>
      : type === 'algorithm.python'
        ? <><path d="m7 6-4 4 4 4" /><path d="m13 6 4 4-4 4" /><path d="m11 4-2 12" /></>
        : type === 'artifact.minecraft'
          ? <><path d="m10 2 8 4v8l-8 4-8-4V6l8-4Z" /><path d="m2 6 8 4 8-4M10 10v8" /></>
          : <><path d="M10 13V3" /><path d="m6 7 4-4 4 4" /><path d="M3 13v4h14v-4" /></>
  return <svg viewBox="0 0 20 20" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}

function statusFor(step: Step, detail: StudentEnrollment) {
  return detail.progress.steps.find((row) => row.step_id === step.id)?.status ?? 'not_started'
}

function stepHref(enrollmentId: string, stepId: string) {
  return `/student/courses/${enrollmentId}/steps/${stepId}`
}

export function CourseRoute({ detail, compact = false, currentStepId }: {
  detail: StudentEnrollment
  compact?: boolean
  currentStepId?: string
}) {
  const sorted = [...detail.steps].sort((a, b) => a.position - b.position)
  if (compact) return <aside className="card route-aside" aria-label="Шаги курса">
    <h2>Шаги курса</h2>
    <ol className="mini-route">
      {sorted.map((step) => <li key={step.id} className={step.id === currentStepId ? 'is-current' : statusFor(step, detail) === 'pending_review' ? 'is-review' : ''}>
        <StepIcon type={step.type_key} />
        <Link to={stepHref(detail.id, step.id)} aria-current={step.id === currentStepId ? 'step' : undefined}>{step.title}</Link>
        {step.id === currentStepId ? <span>ты здесь</span> : <Status value={statusFor(step, detail)} />}
      </li>)}
    </ol>
    {detail.progress.steps.some((row) => row.status === 'pending_review') && <p className="route-note">Куратор проверяет работу. Ты можешь продолжать курс, если следующий шаг открыт.</p>}
  </aside>

  return <section className="card course-route-card" aria-labelledby="course-route-title">
    <div className="route-heading">
      <h2 id="course-route-title">{detail.title}</h2>
      <p>{detail.progress.completed_steps} из {detail.progress.total_steps} шагов зачтено</p>
    </div>
    <ol className="course-route">
      {sorted.map((step) => {
        const status = statusFor(step, detail)
        const current = detail.status === 'active' && step.id === detail.progress.next_step_id
        return <li key={step.id} className={current ? 'is-current' : status === 'accepted' ? 'is-done' : status === 'pending_review' ? 'is-review' : ''}>
          <Link to={stepHref(detail.id, step.id)} aria-current={current ? 'step' : undefined}>
            <span className="route-icon"><StepIcon type={step.type_key} /></span>
            <strong>{step.title}</strong>
          </Link>
          {current && status === 'not_started' ? <span className="route-current-label">Следующий шаг</span>
            : <Status value={status} source={status === 'accepted' ? checkSource(step.type_key) : undefined} />}
        </li>
      })}
    </ol>
    {detail.progress.steps.some((row) => row.status === 'pending_review') && <p className="route-note">Шаг на проверке не блокирует следующий: ты можешь идти дальше, пока куратор смотрит работу.</p>}
  </section>
}

function pointsLabel(points: number) {
  const form = new Intl.PluralRules('ru-RU').select(points)
  return `${points} ${form === 'one' ? 'балл' : form === 'few' ? 'балла' : 'баллов'}`
}

export function CourseScoreCard({ detail }: { detail: StudentEnrollment }) {
  function pointsFor(predicate: (step: Step) => boolean) {
    const ids = new Set(detail.steps.filter(predicate).map((step) => step.id))
    return detail.progress.steps.reduce((sum, row) => sum + (ids.has(row.step_id) ? row.earned_points : 0), 0)
  }
  const groups = [
    { label: 'Теория', points: pointsFor((step) => step.type_key === 'theory') },
    { label: 'Автопроверка', points: pointsFor((step) => checkSource(step.type_key) === 'automatic') },
    { label: 'Принято куратором', points: pointsFor((step) => checkSource(step.type_key) === 'manual') },
  ]
  const available = Math.max(1, detail.progress.available_points)
  return <section className="card score-card" aria-label="Баллы и прогресс">
    <h2>Твой результат</h2>
    <div className="score-total"><strong>{detail.progress.earned_points}</strong><span>из {detail.progress.available_points} баллов<br />{detail.progress.rating_percent}% доступных</span></div>
    <div className="score-segments" role="img" aria-label={`Набрано ${detail.progress.earned_points} из ${detail.progress.available_points} баллов: ${groups.map(({ label, points }) => `${label} ${pointsLabel(points)}`).join(', ')}`}>
      {groups.map(({ label, points }) => <span key={label} style={{ width: `${Math.min(100, Math.max(0, points / available * 100))}%` }} />)}
    </div>
    <progress value={detail.progress.completion_percent} max={100} aria-label="Процент завершения" />
    <p className="score-progress-copy">{detail.progress.completed_steps} из {detail.progress.total_steps} шагов зачтено</p>
    <ul className="score-breakdown">
      {groups.map(({ label, points }) => <li key={label}><span>{label}</span><strong>{pointsLabel(points)}</strong></li>)}
    </ul>
  </section>
}
