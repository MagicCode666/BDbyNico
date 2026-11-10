import { useEffect, useMemo, useState } from 'react'

import { setEditionCover } from './api'
import { findCover, markTried, wasRecentlyTried } from './covers'

const CONCURRENCY = 4

/** Ce dont la recherche a besoin : l'ISBN et la couverture connue, s'il y en a une. */
interface WithCover {
  isbn: string
  coverUrl: string | null
  /** Couverture choisie à la main (même vide) : on ne la recherche pas. */
  locked?: boolean
}

/**
 * Va chercher les couvertures des albums du catalogue qui n'en ont pas et les enregistre pour
 * tous les utilisateurs. Renvoie les couvertures trouvées au fil de l'eau et le nombre restant.
 */
export function useMissingCovers(editions: WithCover[]) {
  const [covers, setCovers] = useState<Record<string, string>>({})
  const [done, setDone] = useState(0)

  const missingKey = editions
    .filter((e) => !e.coverUrl && !e.locked)
    .map((e) => e.isbn)
    .join(',')
  const todo = useMemo(
    () => (missingKey ? missingKey.split(',').filter((isbn) => !wasRecentlyTried(isbn)) : []),
    [missingKey],
  )

  useEffect(() => {
    if (todo.length === 0) return
    let cancelled = false
    let next = 0

    async function worker() {
      while (!cancelled) {
        const index = next++
        if (index >= todo.length) return
        const isbn = todo[index]
        try {
          const url = await findCover(isbn)
          if (cancelled) return
          markTried(isbn)
          if (url) {
            setCovers((current) => ({ ...current, [isbn]: url }))
            // Enregistrement partagé : un échec n'empêche pas l'affichage local
            void setEditionCover(isbn, url).catch(() => {})
          }
        } catch {
          markTried(isbn)
        }
        if (!cancelled) setDone((count) => count + 1)
      }
    }

    void Promise.all(Array.from({ length: CONCURRENCY }, worker))
    return () => {
      cancelled = true
    }
  }, [todo])

  return { covers, remaining: Math.max(0, todo.length - done) }
}
