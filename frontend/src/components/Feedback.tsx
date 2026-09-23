import type { ReactNode } from 'react'
import { errorMessage } from '../api/client'
import type { SubmissionStatus } from '../api/types'

export function ErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="notice error">
      <span>{typeof error === 'string' ? error : errorMessage(error)}</span>
      {onRetry && <button type="button" onClick={onRetry}>Повторить</button>}
    </div>
  )
}

export function InfoNotice({ children }: { children: ReactNode }) {
  return <div className="notice info">{children}</div>
}

export function Loading() {
  return <p role="status">Загрузка…</p>
}

export const statusLabel: Record<SubmissionStatus | 'not_started', string> = {
  not_started: 'Не начато',
  queued: 'Отправлено',
  checking: 'Проверяется',
  pending_review: 'На проверке у куратора',
  accepted: 'Принято',
  incorrect: 'Ответ неверный',
  returned: 'Нужно исправить',
  error: 'Ошибка проверки',
}

export function Status({ value }: { value: SubmissionStatus | 'not_started' }) {
  return <span className={`status status-${value}`}>{statusLabel[value]}</span>
}
