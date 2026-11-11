import { useCallback, useState } from 'react'

export const SIDEBAR_KEY = 'bdbynico:sidebar-reduite'

function readStored(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

/** Menu latéral réduit aux icônes ou déployé ; le choix est retenu d'une visite à l'autre. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readStored)
  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
      } catch {
        // stockage indisponible : le choix vaut pour cette visite seulement
      }
      return next
    })
  }, [])
  return [collapsed, toggle]
}
