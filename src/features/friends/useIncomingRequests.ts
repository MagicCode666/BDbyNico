import { useEffect, useState } from 'react'

import { countIncomingRequests } from './api'

/** Nombre de demandes d'amis reçues en attente (0 si on ne peut pas le savoir). */
export function useIncomingRequests(): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let cancelled = false
    countIncomingRequests()
      .then((value) => !cancelled && setCount(value))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  return count
}
