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
