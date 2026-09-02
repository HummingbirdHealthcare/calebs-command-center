import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from './components/Layout'
import TasksPage from './pages/TasksPage'
import DocumentsPage from './pages/DocumentsPage'
import { ApiError, listTasks } from './lib/api'

const queryClient = new QueryClient()

type GateState = 'checking' | 'ok' | 'forbidden' | 'error'

/** The API is the real access boundary (it checks the caller's email against
 *  ALLOWED_USER_EMAIL), not this component — this just turns a 403 from any
 *  other signed-in Hummingbird user into a clean message instead of a
 *  confusing half-broken UI. Probes with a real read (listTasks) rather than
 *  trusting anything client-side. */
function Gate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking')

  useEffect(() => {
    listTasks()
      .then(() => setState('ok'))
      .catch((e: unknown) => setState(e instanceof ApiError && e.status === 403 ? 'forbidden' : 'error'))
  }, [])

  if (state === 'checking') return <div className="state">Loading…</div>
  if (state === 'forbidden') {
    return (
      <div className="state forbidden">
        <h1>This app is private</h1>
        <p>You're signed in, but Command Center is only accessible to its owner.</p>
        <a href="/.auth/logout">Sign out</a>
      </div>
    )
  }
  if (state === 'error') return <div className="state">Something went wrong. Refresh to retry.</div>
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Navigate to="/tasks" replace />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="documents" element={<DocumentsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Gate>
    </QueryClientProvider>
  )
}
