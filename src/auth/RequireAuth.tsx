import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from './useAuth'

/** Route parente : n'affiche les pages enfants que pour un utilisateur connecté. */
export default function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="p-6 text-center text-muted">Chargement…</p>
  }
  if (!user) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}
