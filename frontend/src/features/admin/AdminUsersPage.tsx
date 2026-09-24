import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import type { AdminUser } from '../../api/types'
import { ErrorNotice, InfoNotice, Loading } from '../../components/Feedback'
import { Pagination } from '../../components/Pagination'
import { usePagedResource } from '../../hooks/usePagedResource'

type ManagedRole = 'student' | 'curator'

export function AdminUsersPage() {
  const [role, setRole] = useState<ManagedRole>('student')
  const users = usePagedResource(`admin-users:${role}`, (page) => api.admin.manageUsers(role, page))
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [message, setMessage] = useState('')

  function changeRole(nextRole: ManagedRole) {
    setRole(nextRole)
    users.setPage(1)
    setError(null)
    setMessage('')
  }

  async function create(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.createUser({ username: username.trim(), display_name: displayName.trim(), role, password })
      setUsername('')
      setDisplayName('')
      setPassword('')
      users.setPage(1)
      users.reload()
      setMessage('Учётная запись создана')
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  async function toggle(user: AdminUser) {
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await api.admin.setUserActive(user.id, !user.is_active)
      users.reload()
      setMessage(user.is_active ? 'Учётная запись отключена' : 'Учётная запись активирована')
    } catch (reason) { setError(reason) }
    finally { setBusy(false) }
  }

  return <section>
    <div className="page-title"><div><h1>Пользователи</h1><p>Создавайте учеников и кураторов. Отключённый пользователь не сможет продолжать работу.</p></div>
      {users.data && <span className="queue-count">В списке: {users.data.meta.total}</span>}
    </div>
    <ErrorNotice error={error} />
    {message && <InfoNotice>{message}</InfoNotice>}
    <div className="assignment-layout">
    <form className="card form-stack assignment-form" onSubmit={create}>
      <h2>Создать {role === 'student' ? 'ученика' : 'куратора'}</h2>
      <label>Логин<input required autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Имя<input required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>Пароль<input required type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <button disabled={busy}>Создать</button>
    </form>
    <section className="card assignment-list" aria-labelledby="user-list-title">
    <div className="list-heading"><h2 id="user-list-title">Список</h2><label>Роль
      <select value={role} onChange={(event) => changeRole(event.target.value as ManagedRole)}>
        <option value="student">Ученики</option>
        <option value="curator">Кураторы</option>
      </select>
    </label></div>
    {users.loading && <Loading />}
    <ErrorNotice error={users.error} onRetry={users.reload} />
    {users.data?.data.length === 0 && <p>Пользователей пока нет.</p>}
    {users.data?.data.map((user) => <article className="user-list-row" key={user.id}>
      <div><h3>{user.display_name}</h3><p>Логин: {user.username}</p></div>
      <span className={user.is_active ? 'user-state active' : 'user-state'}>{user.is_active ? 'Активен' : 'Отключён'}</span>
      <button type="button" disabled={busy} onClick={() => toggle(user)}>{user.is_active ? 'Отключить' : 'Активировать'}</button>
    </article>)}
    <Pagination meta={users.data?.meta} page={users.page} onPage={users.setPage} />
    </section>
    </div>
  </section>
}
