import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'
type ThemeState = { theme: Theme; toggleTheme: () => void }

const storageKey = 'webeducation:theme'
const ThemeContext = createContext<ThemeState | null>(null)

function savedTheme(): Theme {
  try {
    return window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(savedTheme)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try {
      window.localStorage.setItem(storageKey, theme)
    } catch {
      // The active theme still works for this session if storage is unavailable.
    }
  }, [theme])

  function toggleTheme() {
    setTheme((current) => current === 'light' ? 'dark' : 'light')
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('ThemeProvider отсутствует')
  return value
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const nextThemeLabel = theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label={nextThemeLabel}
      aria-pressed={theme === 'dark'}
      title={nextThemeLabel}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.2 15.4A8.5 8.5 0 0 1 8.6 3.8 8.5 8.5 0 1 0 20.2 15.4Z" />
        </svg>
      )}
      <span>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</span>
    </button>
  )
}
