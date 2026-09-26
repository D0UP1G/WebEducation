import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ErrorNotice } from './Feedback'
import { BrandLogo } from './BrandLogo'
import { ThemeToggle } from '../ThemeContext'

const links = {
  student: [
    { href: '/student', label: 'Главная' },
    { href: '/student/courses', label: 'Мои курсы' },
    { href: '/student/profile', label: 'Профиль' },
  ],
  curator: [
    { href: '/curator/reviews', label: 'Очередь проверки' },
    { href: '/curator/students', label: 'Ученики' },
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
      <a className="skip-link" href="#main-content">Перейти к содержимому</a>
      <header className="app-header">
        <Link to={user.role === 'student' ? '/student' : '/'} className="brand"><BrandLogo /><span>WebEducation</span></Link>
        <div className="header-controls">
          <nav aria-label="Основная навигация" className="role-navigation">
            {links[user.role].map(({ href, label }) => <NavLink key={href} to={href} end={href === '/student' || href === '/curator'}>{label}</NavLink>)}
            <ThemeToggle />
          </nav>
          <div className="account">
            <span className="account-copy"><strong>{user.display_name}</strong><span className="account-role">{roleLabel[user.role]}</span></span>
            <span className="user-avatar" aria-hidden="true">{initials(user.display_name)}</span>
            <button type="button" className="logout-icon" aria-label="Выйти" title="Выйти" disabled={busy} onClick={exit}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M14 16l4-4-4-4M18 12H9"/></svg>
            </button>
          </div>
        </div>
      </header>
      <main className="content" id="main-content">
        <ErrorNotice error={error} />
        <Outlet />
      </main>
      <footer className="app-footer"><span>WebEducation</span><span>Образовательная платформа по спортивному программированию</span></footer>
    </div>
  )
}
