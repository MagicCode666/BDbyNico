import { isOutsideGrid, type AlbumKind } from '../collection/kinds'
import type { Status } from '../collection/types'

/** Un album du catalogue partagé qui appartient à la série. */
export interface CatalogueEdition {
  isbn: string
  title: string
  volume: number | null
  coverUrl: string | null
  authors: string[]
  coverLocked?: boolean
  publisher?: string | null
  /** Intégrales, coffrets et hors-séries n'ont pas de case dans la grille des tomes. */
  kind?: AlbumKind
  /** Intégrale : tomes repris (absents : toute la série). */
  volumeFrom?: number | null
  volumeTo?: number | null
  /** Édition principale de son tome, désignée par un modérateur. */
  isPrimary?: boolean
}

/** Une ligne de la collection de l'utilisateur. */
export interface UserItem {
  id: string
  isbn: string
  status: Status
}

/** Une case de la grille : un numéro de tome et son état pour l'utilisateur. */
export type Slot =
  | { kind: 'owned' | 'wanted'; volume: number; edition: CatalogueEdition; item: UserItem }
  | { kind: 'missing'; volume: number; edition: CatalogueEdition }
  | { kind: 'unknown'; volume: number }
  | { kind: 'ignored'; volume: number }

export interface SeriesView {
  /** Nombre de tomes affiché (total personnel, sinon total partagé, sinon plus grand tome connu). */
  total: number
  /** Vrai quand aucun total n'est connu : le nombre affiché n'est qu'un minimum. */
  totalIsEstimate: boolean
  slots: Slot[]
  ownedCount: number
  /** Tomes à posséder pour compléter la série (total moins les tomes ignorés non possédés). */
  targetCount: number
  /** Tomes que l'utilisateur ne possède pas encore et n'ignore pas. */
  missing: number[]
  complete: boolean
  /** La série compte un tome 0 (prologue), en plus des tomes numérotés. */
  hasVolumeZero: boolean
  /** Albums de la série sans numéro de tome. */
  unnumbered: { edition: CatalogueEdition; item: UserItem | null }[]
  /** Intégrales, coffrets et hors-séries : objets distincts des tomes, hors de la grille. */
  integrals: { edition: CatalogueEdition; item: UserItem | null }[]
}

export interface SeriesViewInput {
  /** Total partagé (calculé par le job). */
  total: number | null
  /** Total personnel de l'utilisateur, prioritaire. */
  override: number | null
  editions: CatalogueEdition[]
  items: UserItem[]
  ignored: number[]
  /** Le catalogue connaît un tome 0 (même sans édition chargée ici). */
  startsAtZero?: boolean
}

/**
 * Tomes manquants d'une série : de 1 au total, sans ceux déjà possédés ni ceux ignorés.
 * Renvoie une liste vide si le total est inconnu.
 */
export function missingVolumes(
  total: number | null,
  ownedVolumes: Iterable<number>,
  ignored: number[],
): number[] {
  if (!total) return []
  const owned = new Set(ownedVolumes)
  const skip = new Set(ignored)
  const result: number[] = []
  for (let volume = 1; volume <= total; volume++) {
    if (!owned.has(volume) && !skip.has(volume)) result.push(volume)
  }
  return result
}

/**
 * L'édition qui représente chaque tome quand plusieurs existent : la principale désignée par un
 * modérateur, sinon la première rencontrée (de préférence avec une couverture). Un tome qui n'a
 * qu'une édition est donc représenté par elle.
 */
export function representativeEditions(
  editions: CatalogueEdition[],
): Map<number, CatalogueEdition> {
  const result = new Map<number, CatalogueEdition>()
  for (const edition of editions) {
    if (edition.volume === null || isOutsideGrid(edition.kind)) continue
    const current = result.get(edition.volume)
    if (
      !current ||
      (!current.isPrimary && (edition.isPrimary || (!current.coverUrl && edition.coverUrl)))
    ) {
      result.set(edition.volume, edition)
    }
  }
  return result
}

/** Rassemble catalogue, collection et réglages personnels en une grille de tomes. */
export function buildSeriesView(input: SeriesViewInput): SeriesView {
  const editionByIsbn = new Map(input.editions.map((e) => [e.isbn, e]))
  const ignored = new Set(input.ignored)

  // État de chaque tome possédé ou souhaité (« possédé » l'emporte sur « envie »)
  const byVolume = new Map<number, { edition: CatalogueEdition; item: UserItem }>()
  const unnumbered: SeriesView['unnumbered'] = []
  // Une intégrale est un objet distinct des tomes qu'elle reprend : elle n'occupe aucune case
  const integrals: SeriesView['integrals'] = input.editions
    .filter((edition) => isOutsideGrid(edition.kind))
    .map((edition) => ({
      edition,
      item: input.items.find((item) => item.isbn === edition.isbn) ?? null,
    }))
    .sort(
      (a, b) =>
        (a.edition.volumeFrom ?? -1) - (b.edition.volumeFrom ?? -1) ||
        a.edition.title.localeCompare(b.edition.title, 'fr'),
    )
  const gridEditions = input.editions.filter((edition) => !isOutsideGrid(edition.kind))
  for (const item of input.items) {
    const edition = editionByIsbn.get(item.isbn)
    if (!edition || isOutsideGrid(edition.kind)) continue
    if (edition.volume === null) {
      unnumbered.push({ edition, item })
      continue
    }
    const current = byVolume.get(edition.volume)
    if (!current || (current.item.status === 'wanted' && item.status === 'owned')) {
      byVolume.set(edition.volume, { edition, item })
    }
  }
  // Albums sans numéro de tome : proposés dans la liste « sans numéro »
  for (const edition of gridEditions) {
    if (edition.volume === null && !unnumbered.some((u) => u.edition.isbn === edition.isbn)) {
      unnumbered.push({ edition, item: null })
    }
  }

  // Pour un tome manquant : une édition du catalogue, de préférence avec couverture
  const candidates = representativeEditions(gridEditions)

  const knownMax = Math.max(0, ...byVolume.keys(), ...candidates.keys())
  const chosenTotal = input.override ?? input.total
  const total = Math.max(chosenTotal ?? 0, knownMax)

  // Un tome 0 (prologue) a sa case dès que le catalogue en connaît un : il compte dans la série
  const hasVolumeZero = !!input.startsAtZero || byVolume.has(0) || candidates.has(0)
  const slots: Slot[] = []
  for (let volume = hasVolumeZero ? 0 : 1; volume <= total; volume++) {
    const mine = byVolume.get(volume)
    if (mine) {
      slots.push({
        kind: mine.item.status === 'owned' ? 'owned' : 'wanted',
        volume,
        edition: mine.edition,
        item: mine.item,
      })
    } else if (ignored.has(volume)) {
      slots.push({ kind: 'ignored', volume })
    } else {
      const edition = candidates.get(volume)
      slots.push(edition ? { kind: 'missing', volume, edition } : { kind: 'unknown', volume })
    }
  }

  const ownedCount = slots.filter((s) => s.kind === 'owned').length
  const targetCount = slots.filter((s) => s.kind !== 'ignored').length
  return {
    total,
    totalIsEstimate: chosenTotal === null,
    slots,
    ownedCount,
    targetCount,
    missing: slots
      .filter((s) => s.kind === 'missing' || s.kind === 'unknown' || s.kind === 'wanted')
      .map((s) => s.volume),
    // Une série n'est complète que si l'on possède quelque chose : tomes ou intégrale
    // (les tomes que couvre une intégrale se retirent de sa liste, réglage personnel)
    complete:
      total > 0 &&
      ownedCount === targetCount &&
      (ownedCount > 0 || integrals.some((entry) => entry.item?.status === 'owned')),
    hasVolumeZero,
    unnumbered,
    integrals,
  }
}
