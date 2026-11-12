import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Crumb } from '../Breadcrumbs'

/**
 * Retour d'une page de détail : l'historique s'il y en a un (on revient d'où l'on vient), sinon le
 * niveau parent du fil d'Ariane (lien ouvert directement). Null sur les pages principales
 * (Accueil › Page), où les onglets suffisent.
 */
export function useGoBack(crumbs: Crumb[]): (() => void) | null {
  const navigate = useNavigate()
  const parent =
    crumbs.length > 2
      ? [...crumbs]
          .slice(0, -1)
          .reverse()
          .find((c) => c.to)?.to
      : undefined
  const goBack = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else if (parent) navigate(parent, { replace: true })
  }, [navigate, parent])
  return parent ? goBack : null
}

const EDGE_PX = 24
const MIN_DISTANCE_PX = 80
const MAX_DRIFT_RATIO = 0.5
const MAX_DURATION_MS = 700

/** Vrai si le geste part du bord gauche, va franchement vers la droite et reste à peu près horizontal. */
export function isEdgeSwipeBack(
  start: { x: number; y: number; t: number },
  end: { x: number; y: number; t: number },
): boolean {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  return (
    start.x <= EDGE_PX &&
    dx >= MIN_DISTANCE_PX &&
    dy <= dx * MAX_DRIFT_RATIO &&
    end.t - start.t <= MAX_DURATION_MS
  )
}

/**
 * Balayage depuis le bord gauche vers la droite : retour en arrière, sur écran tactile uniquement.
 * Ignoré pour un geste commencé dans un champ de saisie ou une zone qui défile horizontalement
 * (le bord de 24 px laisse de toute façon les carrousels tranquilles).
 */
export function useEdgeSwipeBack(goBack: (() => void) | null) {
  useEffect(() => {
    if (!goBack) return
    let start: { x: number; y: number; t: number } | null = null

    function onStart(event: TouchEvent) {
      const touch = event.touches[0]
      const target = event.target as HTMLElement | null
      const inField = !!target?.closest('input, textarea, select, [contenteditable="true"]')
      start =
        event.touches.length === 1 && touch && !inField
          ? { x: touch.clientX, y: touch.clientY, t: Date.now() }
          : null
    }
    function onEnd(event: TouchEvent) {
      const touch = event.changedTouches[0]
      if (
        start &&
        touch &&
        isEdgeSwipeBack(start, { x: touch.clientX, y: touch.clientY, t: Date.now() })
      ) {
        goBack?.()
      }
      start = null
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend', onEnd)
    }
  }, [goBack])
}
