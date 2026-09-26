import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api'
import { ErrorNotice, InfoNotice } from '../../components/Feedback'
import { ThemeToggle } from '../../ThemeContext'

export function SetPasswordPage() {
  const { uid = '', token = '' } = useParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirmation) {
      setError(new Error('Пароли не совпадают'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.auth.setPassword(uid, token, password)
      setDone(true)
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <main className="password-setup-page">
    <div className="password-theme-control"><ThemeToggle /></div>
    <section className="card password-setup-card">
      <p className="brand-caption">WebEducation · образовательная платформа</p>
      <h1>Создай пароль</h1>
      {done ? <>
        <InfoNotice>Пароль сохранён. Теперь можно войти в аккаунт.</InfoNotice>
        <button type="button" onClick={() => navigate('/login')}>Перейти ко входу</button>
      </> : <>
        <p>Ссылка одноразовая. После сохранения пароля она перестанет работать.</p>
        <ErrorNotice error={error} />
        <form onSubmit={submit} className="form-stack">
          <label>Новый пароль<input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <small>Не менее 8 символов. Не используй часто встречающиеся пароли и только цифры.</small>
          <label>Повтори пароль<input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          <button disabled={busy || !uid || !token || !password || !confirmation}>{busy ? 'Сохраняем…' : 'Сохранить пароль'}</button>
        </form>
        <p><Link to="/login">Вернуться ко входу</Link></p>
      </>}
    </section>
  </main>
}
