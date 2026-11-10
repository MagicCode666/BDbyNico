import type { Status } from '../collection/types'

/** Un album du catalogue partagé qui appartient à la série. */
export interface CatalogueEdition {
  isbn: string
  title: string
  volume: number | null
  coverUrl: string | null
  authors: string[]
  coverLocked?: boolean
}

/** Une ligne de la collection de l'utilisateur. */
export interface UserItem {
  id: string
  isbn: string
  status: Status
  read: boolean
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
  /** Albums de la série sans numéro de tome. */
  unnumbered: { edition: CatalogueEdition; item: UserItem | null }[]
}

export interface SeriesViewInput {
  /** Total partagé (calculé par le job). */
  total: number | null
  /** Total personnel de l'utilisateur, prioritaire. */
  override: number | null
  editions: CatalogueEdition[]
  items: UserItem[]
  ignored: number[]
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

/** Rassemble catalogue, collection et réglages personnels en une grille de tomes. */
export function buildSeriesView(input: SeriesViewInput): SeriesView {
  const editionByIsbn = new Map(input.editions.map((e) => [e.isbn, e]))
  const ignored = new Set(input.ignored)

  // État de chaque tome possédé ou souhaité (« possédé » l'emporte sur « envie »)
  const byVolume = new Map<number, { edition: CatalogueEdition; item: UserItem }>()
  const unnumbered: SeriesView['unnumbered'] = []
  for (const item of input.items) {
    const edition = editionByIsbn.get(item.isbn)
    if (!edition) continue
    if (edition.volume === null) {
      unnumbered.push({ edition, item })
      continue
    }
    const current = byVolume.get(edition.volume)
    if (!current || (current.item.status === 'wanted' && item.status === 'owned')) {
      byVolume.set(edition.volume, { edition, item })
    }
  }
  // Albums sans numéro, et tome 0 que l'utilisateur n'a pas : proposés dans la liste « sans numéro »
  for (const edition of input.editions) {
    const hasNoSlot = edition.volume === null || (edition.volume === 0 && !byVolume.has(0))
    if (hasNoSlot && !unnumbered.some((u) => u.edition.isbn === edition.isbn)) {
      unnumbered.push({ edition, item: null })
    }
  }

  // Pour un tome manquant : une édition du catalogue, de préférence avec couverture
  const candidates = new Map<number, CatalogueEdition>()
  for (const edition of input.editions) {
    if (edition.volume === null || edition.volume === 0) continue
    const current = candidates.get(edition.volume)
    if (!current || (!current.coverUrl && edition.coverUrl)) candidates.set(edition.volume, edition)
  }

  const knownMax = Math.max(0, ...byVolume.keys(), ...candidates.keys())
  const chosenTotal = input.override ?? input.total
  const total = Math.max(chosenTotal ?? 0, knownMax)

  // Un tome 0 (prologue) n'a de case que si l'utilisateur le possède ou le souhaite
  const slots: Slot[] = []
  for (let volume = byVolume.has(0) ? 0 : 1; volume <= total; volume++) {
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
    complete: total > 0 && ownedCount === targetCount,
    unnumbered,
  }
}
