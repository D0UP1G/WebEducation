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

const roleLabel = { student: 'Ученик', curator: 'Куратор', admin: 'Администратор' }

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toLocaleUpperCase('ru-RU')).join('')
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
    <div className={`app-shell ${user.role === 'student' ? 'role-student' : 'role-staff'}`}>
      <header className="app-header">
        <Link to="/" className="brand">Образовательная платформа <span className="brand-caption">ФСП Чувашии</span></Link>
        <div className="account">
          <span className="account-copy"><strong>{user.display_name}</strong><span className="account-role">{roleLabel[user.role]}</span></span>
          <span className="user-avatar" aria-hidden="true">{initials(user.display_name)}</span>
          <button type="button" disabled={busy} onClick={exit}>Выйти</button>
        </div>
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
