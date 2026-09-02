import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { getCurrentUser, type AuthUser } from '../lib/auth'

export default function Layout() {
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    void getCurrentUser().then(setUser)
  }, [])

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
