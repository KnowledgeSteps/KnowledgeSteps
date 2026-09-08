import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'

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

export function App() {
  return (
    <Suspense
      fallback={
        <div className="loading-page">
          <span className="spark">✧</span>
          <p>页面加载中…</p>
        </div>
      }
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route
            path="/sessions/:sessionId/questions"
            element={<SessionQuestionsPage />}
          />
          <Route
            path="/sessions/:sessionId/result"
            element={<SessionResultPage />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
