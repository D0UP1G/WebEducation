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
      <h1>Вход в WebEducation</h1>
      <p>Введите выданные учебные данные для входа.</p>
      <ErrorNotice error={error} />
      <form onSubmit={submit} className="form-stack">
        <label>Имя пользователя<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Пароль<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <button type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
      </form>
    </main>
  )
}
