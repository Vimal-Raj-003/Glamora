import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner, Empty } from './ui'

export function RequireAuth({ children }) {
  const { user, loading, enabled } = useAuth()
  const location = useLocation()
  if (!enabled) {
    return <Empty title="Sign-in unavailable" text="Add your Clerk keys to .env (see .env.example) to enable accounts and checkout." actionTo="/shop" actionLabel="Continue shopping" />
  }
  if (loading) return <Spinner />
  if (!user) return <Navigate to={`/login?redirect_url=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

export function RequireAdmin({ children }) {
  const { user, isAdmin, loading, enabled } = useAuth()
  const location = useLocation()
  if (!enabled) return <Empty title="Admin unavailable" text="Add your Clerk keys to .env to enable the admin area." actionTo="/" actionLabel="Back home" />
  if (loading) return <Spinner />
  if (!user) return <Navigate to={`/login?redirect_url=${encodeURIComponent(location.pathname)}`} replace />
  if (!isAdmin) {
    return <Empty title="Super Admin only" text="Your account doesn’t have admin access. Add your email to SUPER_ADMIN_EMAILS in .env." actionTo="/" actionLabel="Back home" />
  }
  return children
}
