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
  entries: Entry[]
}

function compareEntries(a: Entry, b: Entry): number {
  const va = a.edition.volume ?? Number.MAX_SAFE_INTEGER
  const vb = b.edition.volume ?? Number.MAX_SAFE_INTEGER
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
