/**
 * Type d'un album du catalogue :
 *  - album : un tome ordinaire de sa série ;
 *  - intégrale : un recueil de plusieurs tomes (objet distinct des tomes qu'il reprend) ;
 *  - hors-série : un album hors de la numérotation.
 */
export type AlbumKind = 'album' | 'integral' | 'special'

export const KIND_LABELS: Record<AlbumKind, string> = {
  album: 'Album (tome)',
  integral: 'Intégrale ou coffret',
  special: 'Hors-série',
}

export function toAlbumKind(value: string | null | undefined): AlbumKind {
  return value === 'integral' || value === 'special' ? value : 'album'
}

/** Vrai pour un album qui n'est pas un tome de la grille (intégrale, coffret, hors-série). */
export const isOutsideGrid = (kind: AlbumKind | undefined): boolean =>
  kind === 'integral' || kind === 'special'

/** « Tomes 1 à 3 », « Tome 2 », « Série complète » (intégrale sans plage). */
export function rangeLabel(from: number | null | undefined, to: number | null | undefined): string {
  if (from == null || to == null) return 'Série complète'
  return from === to ? `Tome ${from}` : `Tomes ${from} à ${to}`
}

/** Les numéros de tomes repris par une intégrale (toute la série si la plage est vide). */
export function coveredVolumes(
  from: number | null | undefined,
  to: number | null | undefined,
  total: number,
): number[] {
  const start = from ?? 1
  const end = to ?? total
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, i) => start + i)
}

/** Libellé court sous une vignette : « Intégr. T1-3 », « Intégr. », « HS ». */
export function shortKindLabel(
  kind: AlbumKind,
  from: number | null | undefined,
  to: number | null | undefined,
): string {
  if (kind === 'special') return 'HS'
  if (from == null || to == null) return 'Intégr.'
  return from === to ? `Intégr. T${from}` : `Intégr. T${from}-${to}`
}

const INTEGRAL_PATTERN = /int[ée]grale|coffret|recueil|r[ée]unit/i

/**
 * Devine le type d'un album d'après son titre et, si on l'a, la note du catalogue (la BnF écrit
 * « Réunit : … » pour un recueil). Ce n'est qu'une suggestion, que l'utilisateur confirme.
 */
export function detectKind(title: string, note?: string | null): AlbumKind {
  return INTEGRAL_PATTERN.test(title) || (note ? /(^|\|)\s*r[ée]unit/i.test(note) : false)
    ? 'integral'
    : 'album'
}

/** « 1 à 3 » pour des numéros qui se suivent, « 1, 3, 4 » sinon. */
export function volumeListLabel(volumes: number[]): string {
  if (volumes.length === 0) return ''
  if (volumes.length === 1) return String(volumes[0])
  const contiguous = volumes.every((volume, i) => i === 0 || volume === volumes[i - 1] + 1)
  return contiguous ? `${volumes[0]} à ${volumes[volumes.length - 1]}` : volumes.join(', ')
}
