import { LoadingScreen } from './components/ui/LoadingScreen'
import { lazy, Suspense, useEffect } from 'react'
import { type ReactNode } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { RequireAuth } from './components/layout/RequireAuth'
import { ensureCurrentUser } from './api/auth'
import { PageviewTracker } from './components/analytics/PageviewTracker'

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })))
const DoubtsPage = lazy(() => import('./pages/DoubtsPage').then(m => ({ default: m.DoubtsPage })))
const KnowledgeCardsPage = lazy(() => import('./pages/KnowledgeCardsPage').then(m => ({ default: m.KnowledgeCardsPage })))

const SessionHistoryPage = lazy(() => import('./pages/SessionHistoryPage').then(m => ({ default: m.SessionHistoryPage })))

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
    <><PageviewTracker />
    <Suspense
      fallback={<LoadingScreen />}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/history" element={<SessionHistoryPage />} />
            <Route path="/doubts" element={<DoubtsPage />} />
            <Route path="/knowledge-cards" element={<KnowledgeCardsPage />} />
            <Route path="/admin/analytics" element={<AnalyticsPage />} />
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
    </Suspense></>
  )
}
