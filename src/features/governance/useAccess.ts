import { useCallback } from 'react'

import { useAuth } from '../../auth/useAuth'
import { useAsync } from '../collection/useAsync'
import { getMyAccess, NO_ACCESS, type Access } from './api'

/** Rôle et niveau de contribution de l'utilisateur connecté (accès ordinaire tant que non chargé). */
export function useAccess(): { access: Access; loading: boolean } {
  const { user } = useAuth()
  const userId = user?.id
  const load = useCallback(
    () => (userId ? getMyAccess(userId) : Promise.resolve(NO_ACCESS)),
    [userId],
  )
  const { data, loading } = useAsync(load)
  return { access: data ?? NO_ACCESS, loading }
}
