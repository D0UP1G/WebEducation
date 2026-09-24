import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import type { Course, Step } from '../../api/types'
import { StepContent } from '../student/StepContent'
import { StepEditorForm } from './StepEditorForm'

export function AdminCoursePage() {
  const { courseId = '' } = useParams()
  const course = useResource(`admin-course:${courseId}`, () => api.admin.course(courseId))
  const types = useResource('step-types', api.admin.types)
  const [editing, setEditing] = useState<Step | 'new' | null>(null)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.admin.preview>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setEditing(null)
    setPreview(null)
    setError(null)
    setMessage('')
  }, [courseId])

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError(null)
    setMessage('')
    try { await action(); course.reload(); setPreview(null); setMessage(success) }
    catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  async function saveStep(step: Omit<Step, 'id'>) {
    if (editing && editing !== 'new') await api.admin.updateStep(courseId, editing.id, step)
    else await api.admin.createStep(courseId, step)
    setEditing(null)
    course.reload()
    setPreview(null)
    setMessage('Шаг сохранён')
  }

  async function removeStep(step: Step) {
    if (!window.confirm(`Удалить шаг «${step.title}» из черновика?`)) return
    await perform(() => api.admin.deleteStep(courseId, step.id), 'Шаг удалён')
  }

  async function moveStep(step: Step, direction: -1 | 1) {
    const sorted = [...(course.data?.draft_steps ?? [])].sort((a, b) => a.position - b.position)
    const index = sorted.findIndex((item) => item.id === step.id)
    const other = sorted[index + direction]
    if (!other) return
    await perform(() => api.admin.updateStep(courseId, step.id, { position: other.position }), 'Порядок шагов изменён')
  }

  async function showPreview() {
    setBusy(true)
    setError(null)
    try { setPreview(await api.admin.preview(courseId)) }
    catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  function confirmPublish() {
    const currentCourse = course.data
    if (!currentCourse) return
    const nextVersion = (currentCourse.latest_version ?? 0) + 1
    const confirmed = window.confirm(
      `Опубликовать версию ${nextVersion} курса «${currentCourse.title}»? Уже назначенные ученики останутся на своей версии.`,
    )
    if (confirmed) void perform(() => api.admin.publish(courseId), 'Новая версия опубликована')
  }

  return <section>
    <p><Link to="/admin/courses">← К курсам</Link></p>
    {course.loading && <Loading />}
    <ErrorNotice error={course.error} onRetry={course.reload} />
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    {course.data && <>
      <h1>{course.data.title}</h1>
      <p>Последняя публикация: {course.data.latest_version ?? 'нет'}. Изменения ниже относятся к черновику.</p>
      <CourseMetadataForm key={course.data.updated_at} course={course.data} onSave={(body) => perform(() => api.admin.updateCourse(courseId, body), 'Данные курса сохранены')} />
      <h2>Шаги черновика</h2>
      <ol className="step-list">
        {[...(course.data.draft_steps ?? [])].sort((a, b) => a.position - b.position).map((step, index, sorted) =>
          <li key={step.id}>
            <div><strong>{step.title}</strong> · {types.data?.find((item) => item.type_key === step.type_key)?.title ?? step.type_key} · {step.max_score} баллов</div>
            <div className="actions">
              <button type="button" disabled={busy || index === 0} onClick={() => moveStep(step, -1)}>↑</button>
              <button type="button" disabled={busy || index === sorted.length - 1} onClick={() => moveStep(step, 1)}>↓</button>
              <button type="button" disabled={busy} onClick={() => setEditing(step)}>Изменить</button>
              <button type="button" disabled={busy} onClick={() => removeStep(step)}>Удалить</button>
            </div>
          </li>)}
      </ol>
      {!editing && <button type="button" onClick={() => setEditing('new')}>Добавить шаг</button>}
      {editing && <>
        {types.loading && <Loading />}
        <ErrorNotice error={types.error} onRetry={types.reload} />
        {types.data && <StepEditorForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? undefined : editing}
          types={types.data}
          position={Math.max(0, ...(course.data.draft_steps ?? []).map((item) => item.position)) + 1}
          onSave={saveStep}
          onCancel={() => setEditing(null)}
        />}
      </>}
      <div className="actions section-actions">
        <button type="button" disabled={busy} onClick={showPreview}>Предпросмотр</button>
        <button type="button" disabled={busy} onClick={confirmPublish}>Опубликовать новую версию</button>
      </div>
      {preview && <section className="card"><h2>Предпросмотр для ученика</h2>
        <h3>{preview.title}</h3><p>{preview.description}</p>
        <ol>{preview.steps.map((step) => <li key={step.id}><strong>{step.title}</strong><StepContent step={step} /></li>)}</ol>
      </section>}
    </>}
  </section>
}

function CourseMetadataForm({ course, onSave }: { course: Course; onSave: (body: Pick<Course, 'title' | 'description' | 'grade_min' | 'grade_max'>) => Promise<void> }) {
  const [title, setTitle] = useState(course.title)
  const [description, setDescription] = useState(course.description)
  const [gradeMin, setGradeMin] = useState(course.grade_min)
  const [gradeMax, setGradeMax] = useState(course.grade_max)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try { await onSave({ title: title.trim(), description: description.trim(), grade_min: gradeMin, grade_max: gradeMax }) }
    catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <form onSubmit={submit} className="card form-stack">
    <h2>Описание курса</h2>
    <ErrorNotice error={error} />
    <label>Название<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label>Описание<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <div className="field-row">
      <label>Класс от<input type="number" min={1} max={9} value={gradeMin} onChange={(event) => setGradeMin(Number(event.target.value))} /></label>
      <label>Класс до<input type="number" min={gradeMin} max={9} value={gradeMax} onChange={(event) => setGradeMax(Number(event.target.value))} /></label>
    </div>
    <button disabled={busy || !title.trim()}>Сохранить описание</button>
  </form>
}
