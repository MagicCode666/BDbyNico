import type { PublicationStatus } from '../series/status'
import { isOutsideGrid } from './kinds'
import type { Entry, ReadFilter, Status } from './types'

/** Minuscules sans accents, pour des recherches tolérantes. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export interface Filters {
  status: Status
  query: string
  read: ReadFilter
  /** Ne garder que les albums dédicacés (signature ou dessin). */
  dedicatedOnly?: boolean
}

export function filterEntries(
  entries: Entry[],
  { status, query, read, dedicatedOnly }: Filters,
): Entry[] {
  const needle = normalizeText(query.trim())
  return entries.filter((entry) => {
    if (entry.status !== status) return false
    if (read === 'read' && !entry.read) return false
    if (read === 'unread' && entry.read) return false
    if (dedicatedOnly && !entry.dedication) return false
    if (!needle) return true
    const { edition } = entry
    const haystack = normalizeText(
      [
        edition.title,
        edition.series?.name ?? '',
        ...edition.authors,
        edition.isbn,
        entry.dedicationBy ?? '',
      ].join(' '),
    )
    return haystack.includes(needle)
  })
}

export interface SeriesGroup {
  /** Identifiant de série, ou « _ » pour les albums hors série. */
  key: string
  name: string | null
  totalVolumes: number | null
  publicationStatus: PublicationStatus | null
  entries: Entry[]
}

function compareEntries(a: Entry, b: Entry): number {
  // Les tomes d'abord, puis les intégrales et hors-séries (par premier tome repris)
  const outsideA = isOutsideGrid(a.edition.kind) ? 1 : 0
  const outsideB = isOutsideGrid(b.edition.kind) ? 1 : 0
  if (outsideA !== outsideB) return outsideA - outsideB
  const va = (outsideA ? a.edition.volumeFrom : a.edition.volume) ?? Number.MAX_SAFE_INTEGER
  const vb = (outsideB ? b.edition.volumeFrom : b.edition.volume) ?? Number.MAX_SAFE_INTEGER
  return va - vb || a.edition.title.localeCompare(b.edition.title, 'fr')
}

/** Regroupe par série (ordre alphabétique), les albums hors série à la fin. */
export function groupBySeries(entries: Entry[]): SeriesGroup[] {
  const groups = new Map<string, SeriesGroup>()
  for (const entry of entries) {
    const series = entry.edition.series
    const key = series?.id ?? '_'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        name: series?.name ?? null,
        totalVolumes: series?.totalVolumes ?? null,
        publicationStatus: series?.publicationStatus ?? null,
        entries: [],
      }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...groups.values()]
    .map((group) => ({ ...group, entries: group.entries.sort(compareEntries) }))
    .sort((a, b) => {
      if (a.name === null) return 1
      if (b.name === null) return -1
      return a.name.localeCompare(b.name, 'fr')
    })
}

/** Texte de progression d'une série, ex. « 3 / 12 tomes » (ou « 3 tomes » si le total est inconnu). */
export function progressLabel(group: SeriesGroup, ownedCount: number): string {
  const unit = ownedCount > 1 ? 'tomes' : 'tome'
  return group.totalVolumes
    ? `${ownedCount} / ${group.totalVolumes} tomes`
    : `${ownedCount} ${unit}`
}

/**
 * Total à afficher : on ne peut pas posséder plus de tomes qu'il n'en existe, donc un tome possédé
 * plus grand que le total connu (ex. tome absent de la base de référence) relève ce total.
 */
export function effectiveTotal(total: number | null, ownedVolumes: number[]): number | null {
  const highest = Math.max(total ?? 0, ...ownedVolumes)
  return highest > 0 ? highest : null
}
