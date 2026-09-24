import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import { ApiError, errorMessage } from '../api/client'
import type { Role, User } from '../api/types'

type AuthState = {
  user: User | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<User>
  logout: () => Promise<void>
  retry: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export const homeForRole = (role: Role) =>
  role === 'student' ? '/student/courses' : role === 'curator' ? '/curator/reviews' : '/admin/courses'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const unauthorized = () => { setUser(null); setError(null) }
    window.addEventListener('webeducation:unauthorized', unauthorized)
    return () => window.removeEventListener('webeducation:unauthorized', unauthorized)
  }, [])

  useEffect(() => {
    let active = true
    api.auth.me().then(
      (current) => {
        if (active) { setUser(current); setError(null); setLoading(false) }
      },
      (reason) => {
        if (!active) return
        if (reason instanceof ApiError && (reason.status === 401 || reason.status === 403)) {
          setUser(null)
          setError(null)
        } else {
          setError(errorMessage(reason))
        }
        setLoading(false)
      },
    )
    return () => { active = false }
  }, [revision])

  async function login(username: string, password: string) {
    const current = await api.auth.login(username, password)
    setUser(current)
    setError(null)
    return current
  }

  async function logout() {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, retry: () => { setLoading(true); setRevision((value) => value + 1) } }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider отсутствует')
  return value
}
