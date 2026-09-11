import { LoadingScreen } from '../ui/LoadingScreen'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { loginUrl } from '../../api/loginNavigation'
import { useAuth } from '../../hooks/useAuth'

export function RequireAuth() {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'authenticated') return <Outlet />
  if (auth.status === 'anonymous' || auth.status === 'error') return <Navigate to={loginUrl(location.pathname)} replace />
  return <LoadingScreen label="正在确认登录状态…" />
}
