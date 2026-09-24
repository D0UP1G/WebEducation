import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ErrorNotice } from './Feedback'

const links = {
  student: [{ href: '/student/courses', label: 'Мои курсы' }],
  curator: [
    { href: '/curator', label: 'Обзор' },
    { href: '/curator/students', label: 'Ученики' },
    { href: '/curator/reviews', label: 'Проверка работ' },
    { href: '/curator/questions', label: 'Вопросы' },
  ],
  admin: [
    { href: '/admin/courses', label: 'Курсы' },
    { href: '/admin/assignments', label: 'Назначения' },
    { href: '/admin/users', label: 'Пользователи' },
  ],
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  if (!user) return null

  async function exit() {
    setBusy(true)
    setError(null)
    try { await logout(); navigate('/login', { replace: true }) }
    catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">WebEducation</Link>
        <div className="account"><span>{user.display_name} · {user.role}</span><button type="button" disabled={busy} onClick={exit}>Выйти</button></div>
      </header>
      <nav aria-label="Разделы" className="app-nav">
        {links[user.role].map(({ href, label }) => <NavLink key={href} to={href} end={href === '/curator'}>{label}</NavLink>)}
      </nav>
      <main className="content">
        <ErrorNotice error={error} />
        <Outlet />
      </main>
    </div>
  )
}
