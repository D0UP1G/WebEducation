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
  pending_review: 'На проверке',
  accepted: 'Зачтено',
  incorrect: 'Не прошло тесты',
  returned: 'Возвращено',
  error: 'Ошибка среды',
}

const statusIcon: Record<SubmissionStatus | 'not_started', ReactNode> = {
  not_started: <><rect x="4" y="8" width="12" height="9" rx="2" /><path d="M7 8V6a3 3 0 0 1 6 0v2" /></>,
  queued: <><path d="M10 3v9" /><path d="m6 9 4 4 4-4" /><path d="M4 16h12" /></>,
  checking: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>,
  pending_review: <><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" /></>,
  accepted: <path d="m4 10 4 4 8-8" />,
  incorrect: <><path d="m5 5 10 10" /><path d="M15 5 5 15" /></>,
  returned: <><path d="M7 6H4v4" /><path d="M4 10a6 6 0 1 1 2 5" /></>,
  error: <><path d="M10 3 2 17h16L10 3Z" /><path d="M10 8v4" /><path d="M10 15h.01" /></>,
}

export function Status({ value, source }: { value: SubmissionStatus | 'not_started'; source?: 'manual' | 'automatic' }) {
  const badge = <span className={`status status-${value}`}>
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{statusIcon[value]}</svg>
    <span>{statusLabel[value]}</span>
  </span>
  if (value !== 'accepted' || !source) return badge
  return <span className="status-with-source">{badge}<small>{source === 'manual' ? 'проверил куратор' : 'проверено тестами'}</small></span>
}
