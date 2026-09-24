import type { StudentCourse } from '../../api/types'
import { InfoNotice } from '../../components/Feedback'

export function EnrollmentStatusNotice({ status }: { status: StudentCourse['status'] }) {
  if (status === 'paused') return <InfoNotice>Назначение приостановлено. Материалы доступны, но сдавать шаги пока нельзя.</InfoNotice>
  if (status === 'completed') return <InfoNotice>Назначение завершено. Материалы и результаты доступны только для просмотра; новые сдачи недоступны.</InfoNotice>
  return null
}
