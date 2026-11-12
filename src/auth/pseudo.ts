import { useEffect, useState } from 'react'

import { supabase } from '../lib/supabase'
import { normalizePseudo, validatePseudo } from './validation'

/** Ce pseudo est-il valide et libre ? (le compte connecté n'est pas en conflit avec lui-même) */
export async function pseudoAvailable(pseudo: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('pseudo_available', { p_pseudo: pseudo })
  if (error) throw error
  return data
}

export type PseudoStatus = 'idle' | 'invalid' | 'checking' | 'free' | 'taken' | 'unknown'

const DEBOUNCE_MS = 400

/**
 * Disponibilité d'un pseudo pendant la saisie (vérifiée un instant après la dernière frappe).
 * `current` : le pseudo actuel du compte, qui reste évidemment disponible pour lui.
 * Si la vérification échoue, le statut est « unknown » : la base tranchera à l'enregistrement.
 */
export function usePseudoStatus(pseudo: string, current?: string): PseudoStatus {
  const value = normalizePseudo(pseudo)
  const skip = value === '' || value === current
  const invalid = !skip && validatePseudo(value) !== null
  const [result, setResult] = useState<{ value: string; status: PseudoStatus } | null>(null)

  useEffect(() => {
    if (skip || invalid) return
    let cancelled = false
    const timer = setTimeout(() => {
      pseudoAvailable(value)
        .then((free) => !cancelled && setResult({ value, status: free ? 'free' : 'taken' }))
        .catch(() => !cancelled && setResult({ value, status: 'unknown' }))
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [value, skip, invalid])

  if (skip) return 'idle'
  if (invalid) return 'invalid'
  return result?.value === value ? result.status : 'checking'
}
