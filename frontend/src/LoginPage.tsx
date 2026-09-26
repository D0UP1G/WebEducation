import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, homeForRole } from './auth/AuthContext'
import { ErrorNotice, Loading } from './components/Feedback'
import { BrandLogo } from './components/BrandLogo'
import { ThemeToggle } from './ThemeContext'

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
      <div className="login-topbar">
        <div className="login-brand"><BrandLogo /><span>WebEducation</span></div>
        <ThemeToggle />
      </div>
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
      <footer className="login-footer">WebEducation · Образовательная платформа по спортивному программированию</footer>
    </main>
  )
}
