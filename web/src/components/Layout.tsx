import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { getCurrentUser, type AuthUser } from '../lib/auth'
import { applyTheme, getInitialTheme, type Theme } from '../lib/theme'

export default function Layout() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="app-title">
          Command Center
        </Link>
        <nav className="app-nav">
          <NavLink to="/tasks" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tasks
          </NavLink>
          <NavLink to="/documents" className={({ isActive }) => (isActive ? 'active' : '')}>
            Documents
          </NavLink>
        </nav>
        <div className="app-user">
          <button
            type="button"
            className="theme-toggle"
            title="Toggle dark mode"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {user && <span>{user.userDetails}</span>}
          <a href="/.auth/logout">Sign out</a>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
