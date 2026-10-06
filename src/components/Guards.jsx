import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Spinner, Empty } from './ui'

export function RequireAuth({ children }) {
  const { user, loading, enabled } = useAuth()
  const location = useLocation()
  if (!enabled) {
    return <Empty title="Sign-in unavailable" text="Connect Supabase (see .env.example) to enable accounts and checkout." actionTo="/shop" actionLabel="Continue shopping" />
  }
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function RequireAdmin({ children }) {
  const { user, isAdmin, loading, profile } = useAuth()
  if (loading || (user && !profile)) return <Spinner />
  if (!user) return <Navigate to="/login" replace state={{ from: '/admin' }} />
  if (!isAdmin) return <Empty title="Admins only" text="Your account doesn’t have admin access." actionTo="/" actionLabel="Back home" />
  return children
}
