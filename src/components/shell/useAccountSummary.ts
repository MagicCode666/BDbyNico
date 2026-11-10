import { useCallback } from 'react'

import { useAuth } from '../../auth/useAuth'
import { useAsync } from '../../features/collection/useAsync'
import { supabase } from '../../lib/supabase'

export interface AccountSummary {
  pseudo: string
  role: 'user' | 'moderator' | 'admin'
}

// Mémorisé entre deux pages : le bloc « compte » de la barre latérale ne clignote pas à chaque
// navigation (la barre est recréée avec la page).
const cache = new Map<string, AccountSummary>()

async function load(userId: string): Promise<AccountSummary> {
  const { data, error } = await supabase
    .from('profiles')
    .select('pseudo, role')
    .eq('id', userId)
    .single()
  if (error) throw error
  const summary: AccountSummary = {
    pseudo: data.pseudo,
    role: data.role === 'admin' || data.role === 'moderator' ? data.role : 'user',
  }
  cache.set(userId, summary)
  return summary
}

/** Pseudo et rôle de l'utilisateur connecté, pour la barre latérale. */
export function useAccountSummary(): AccountSummary | undefined {
  const { user } = useAuth()
  const userId = user?.id
  const fetchSummary = useCallback(
    () => (userId ? load(userId) : Promise.reject(new Error('Non connecté'))),
    [userId],
  )
  const { data } = useAsync(fetchSummary)
  return data ?? (userId ? cache.get(userId) : undefined)
}

export const ROLE_LABELS: Record<AccountSummary['role'], string> = {
  user: 'Collectionneur',
  moderator: 'Modérateur',
  admin: 'Administrateur',
}
