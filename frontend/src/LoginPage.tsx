import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, homeForRole } from './auth/AuthContext'
import { ErrorNotice, Loading } from './components/Feedback'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (loading) return <Loading />
  if (user) return <Navigate to={homeForRole(user.role)} replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const current = await login(username.trim(), password)
      navigate(homeForRole(current.role), { replace: true })
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return (
    <main className="login-page">
      <div className="login-decoration" aria-hidden="true">
        <svg className="login-symbol symbol-book" viewBox="0 0 48 48" fill="none"><path d="M7 10.5c6-2 11.7-1.2 17 2.2v25c-5.3-3.4-11-4.2-17-2.2v-25Z"/><path d="M41 10.5c-6-2-11.7-1.2-17 2.2v25c5.3-3.4 11-4.2 17-2.2v-25Z"/><path d="M24 13v25"/></svg>
        <svg className="login-symbol symbol-code" viewBox="0 0 48 48" fill="none"><path d="m17 14-10 10 10 10M31 14l10 10-10 10M28 9l-8 30"/></svg>
        <svg className="login-symbol symbol-target" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="8"/><path d="m24 24 14-14M32 10h6v6"/></svg>
        <svg className="login-symbol symbol-pencil" viewBox="0 0 48 48" fill="none"><path d="m9 33 22-22 7 7-22 22-9 2 2-9Z"/><path d="m27 15 7 7M9 40h29"/></svg>
      </div>
      <div className="login-brand"><span className="login-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3.5 5.5c3.3-1.1 6.1-.8 8.5 1v13c-2.4-1.8-5.2-2.1-8.5-1v-13Z"/><path d="M20.5 5.5c-3.3-1.1-6.1-.8-8.5 1v13c2.4-1.8 5.2-2.1 8.5-1v-13Z"/><path d="M12 6.5v13"/></svg></span><span>Образовательная платформа <small>ФСП Чувашии</small></span></div>
      <div className="login-layout">
        <section className="login-story" aria-labelledby="login-story-title">
          <p className="login-eyebrow">Спортивное программирование · 1–9 классы</p>
          <h1 id="login-story-title">Спортивное программирование — шаг за шагом</h1>
          <p className="login-lead">Курсы, задачи, результаты и поддержка куратора собраны в одном учебном маршруте.</p>
          <ul className="login-benefits">
            <li><span className="login-benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 17a2 2 0 0 1 2-2h14M8 7h8M8 10h6"/></svg></span><span><strong>Понятные курсы</strong><small>Теория, вопросы и задания собраны в маршрут.</small></span></li>
            <li><span className="login-benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg></span><span><strong>Практика программирования</strong><small>Редактор кода, примеры и автоматическая проверка.</small></span></li>
            <li><span className="login-benefit-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 18V6M4 18h16M7 15l4-4 3 2 5-6"/><path d="M16 7h3v3"/></svg></span><span><strong>Прогресс и поддержка</strong><small>Результаты обучения и вопросы куратору в одном месте.</small></span></li>
          </ul>
          <p className="login-story-note">Для ученика следующий шаг открывается после зачёта текущего.</p>
        </section>
        <section className="login-card" aria-labelledby="login-heading">
          <div className="login-card-heading"><span className="login-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 3 4 7v5c0 5 3.4 8 8 9 4.6-1 8-4 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg></span><div><h2 id="login-heading">Вход в аккаунт</h2><p>Для входа нужны логин и пароль, выданные администратором.</p></div></div>
          <ErrorNotice error={error} />
          <form onSubmit={submit} className="form-stack">
            <label>Имя пользователя<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Пароль<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
          </form>
          <p className="login-card-footnote">При проблеме со входом доступ поможет восстановить администратор.</p>
        </section>
      </div>
      <footer className="login-footer">Образовательная платформа · Федерация спортивного программирования Чувашской Республики</footer>
    </main>
  )
}
