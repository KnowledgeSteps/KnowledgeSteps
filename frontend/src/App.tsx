import { LoadingScreen } from './components/ui/LoadingScreen'
import { lazy, Suspense, useEffect } from 'react'
import { type ReactNode } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { RequireAuth } from './components/layout/RequireAuth'
import { ensureCurrentUser } from './api/auth'

const HomePage = lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage })),
)
const SessionQuestionsPage = lazy(() =>
  import('./pages/SessionQuestionsPage').then((m) => ({
    default: m.SessionQuestionsPage,
  })),
)
const SessionResultPage = lazy(() =>
  import('./pages/SessionResultPage').then((m) => ({
    default: m.SessionResultPage,
  })),
)
const NotFoundPage = lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
)
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))

function SessionPage({ children }: { children: ReactNode }) {
  const { sessionId } = useParams()
  return <div key={sessionId}>{children}</div>
}

export function App() {
  useEffect(() => {
    void ensureCurrentUser().catch(() => undefined)
  }, [])

  return (
    <Suspense
      fallback={<LoadingScreen />}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/sessions/:sessionId/questions"
              element={<SessionPage><SessionQuestionsPage /></SessionPage>}
            />
            <Route
              path="/sessions/:sessionId/result"
              element={<SessionPage><SessionResultPage /></SessionPage>}
            />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
