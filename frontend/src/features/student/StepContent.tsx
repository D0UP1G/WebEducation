import type { Step } from '../../api/types'

export function StepContent({ step }: { step: Step }) {
  const content = step.content
  switch (step.type_key) {
    case 'theory':
      return <div className="reading-text"><p>{content.body}</p></div>
    case 'quiz.single_choice':
    case 'quiz.multiple_choice':
      return <p>{content.question}</p>
    case 'answer.exact':
    case 'scratch.numeric_answer':
      return <p>{content.prompt}</p>
    case 'algorithm.python':
      return <>
        <p>{content.statement}</p>
        {(content.time_limit_ms || content.memory_limit_mb) &&
          <p className="muted">Лимит времени: {content.time_limit_ms ?? '—'} мс; память: {content.memory_limit_mb ?? '—'} МБ.</p>}
      </>
    case 'artifact.scratch':
    case 'artifact.minecraft':
    case 'artifact.project':
      return <p>{content.instructions}</p>
    default:
      return <p>Этот тип шага пока не поддерживается интерфейсом.</p>
  }
}
