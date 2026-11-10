/** Statut de publication d'une série : en cours ou terminée (plus aucun tome à paraître). */
export type PublicationStatus = 'ongoing' | 'finished'

export const PUBLICATION_LABELS: Record<PublicationStatus, string> = {
  ongoing: 'En cours',
  finished: 'Terminée',
}

export function toPublicationStatus(value: string | null | undefined): PublicationStatus | null {
  return value === 'ongoing' || value === 'finished' ? value : null
}

/** Le choix personnel de l'utilisateur prime sur le statut partagé (venu de la BnF). */
export function effectiveStatus(
  override: PublicationStatus | null | undefined,
  shared: PublicationStatus | null | undefined,
): PublicationStatus | null {
  return override ?? shared ?? null
}

/**
 * Mention affichée quand tous les tomes connus sont possédés. « Complète » n'est dite que pour une
 * série terminée : pour une série en cours (ou au statut inconnu), de nouveaux tomes ont pu sortir
 * sans être encore référencés, on dit « À jour ».
 */
export function completionLabel(
  complete: boolean,
  status: PublicationStatus | null | undefined,
): 'Complète' | 'À jour' | null {
  if (!complete) return null
  return status === 'finished' ? 'Complète' : 'À jour'
}
