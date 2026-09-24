import { useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { useResource } from '../../hooks/useResource'
import type { Course, Step } from '../../api/types'
import { StepContent } from '../student/StepContent'
import { StepIcon } from '../student/CourseRoute'
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

  useEffect(() => {
    if (editing || !course.data?.draft_steps?.length) return
    setEditing([...course.data.draft_steps].sort((a, b) => a.position - b.position)[0])
  }, [course.data, editing])

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
    {course.loading && <Loading />}
    <ErrorNotice error={course.error} onRetry={course.reload} />
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    {course.data && <>
      <div className="page-title">
        <div><p className="page-eyebrow">Курсы · черновик</p><h1>{course.data.title}</h1>
          <p>Назначенные версии курса останутся без изменений после публикации.</p></div>
        <span className="draft-badge"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" /><path d="M13 3v4h4M6 11h8M6 14h5" /></svg>Черновик · версия {(course.data.latest_version ?? 0) + 1}</span>
      </div>
      <div className="admin-editor-layout">
        <aside className="card course-outline" aria-label="Шаги черновика">
          <h2>Шаги курса · {course.data.draft_steps?.length ?? 0}</h2>
          <ol className="outline-list">
            {[...(course.data.draft_steps ?? [])].sort((a, b) => a.position - b.position).map((step, index, sorted) =>
              <li key={step.id} className={editing !== 'new' && editing?.id === step.id ? 'is-selected' : ''}>
                <div className="outline-step">
                  <span className="outline-type-icon"><StepIcon type={step.type_key} /></span>
                  <span><strong>{step.title}</strong><small>Шаг {step.position} · {types.data?.find((item) => item.type_key === step.type_key)?.title ?? step.type_key} · {step.max_score} баллов</small></span>
                </div>
                <div className="outline-actions">
                  <button type="button" aria-label={`Поднять шаг ${step.title}`} disabled={busy || index === 0} onClick={() => moveStep(step, -1)}>↑</button>
                  <button type="button" aria-label={`Опустить шаг ${step.title}`} disabled={busy || index === sorted.length - 1} onClick={() => moveStep(step, 1)}>↓</button>
                  <button type="button" disabled={busy} onClick={() => setEditing(step)}>Изменить</button>
                  <button type="button" disabled={busy} onClick={() => removeStep(step)}>Удалить</button>
                </div>
              </li>)}
          </ol>
          {!editing && <button type="button" className="primary-button" onClick={() => setEditing('new')}>Добавить шаг</button>}
        </aside>
        <div className="admin-editor-main">
          {editing ? <>
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
          </> : <div className="card editor-intro"><h2>Редактор курса</h2><p>Выберите шаг слева или добавьте новый. Изменения сохраняются в черновике.</p></div>}
          <CourseMetadataForm key={course.data.updated_at} course={course.data} onSave={(body) => perform(() => api.admin.updateCourse(courseId, body), 'Данные курса сохранены')} />
          <div className="card editor-publish">
            <h2>Публикация</h2>
            <p>Последняя версия: {course.data.latest_version ?? 'нет'}. Новая публикация не изменит уже назначенные версии.</p>
            {(!(course.data.draft_steps ?? []).some((step) => step.type_key === 'theory') || !(course.data.draft_steps ?? []).some((step) => step.type_key.startsWith('quiz.'))) &&
              <p className="notice info">Для публикации добавьте теорию и контрольный вопрос. Проверку условий выполняет сервер.</p>}
            <div className="actions">
              <button type="button" disabled={busy} onClick={showPreview}>Предпросмотр</button>
              <button type="button" className="primary-button" disabled={busy} onClick={confirmPublish}>Опубликовать новую версию</button>
            </div>
          </div>
        </div>
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
