import type { GridCard } from '../collection/SeriesGrid'
import { toAlbumKind, isOutsideGrid } from '../collection/kinds'
import type { Entry, Status } from '../collection/types'
import {
  effectiveTotal,
  groupBySeries,
  seriesCoverUrl,
  withoutSupersededWishes,
} from '../collection/utils'
import { seriesProgress } from '../series/progress'
import { toPublicationStatus } from '../series/status'
import type { SharedRow } from './api'

/** Présente les lignes publiques comme des entrées de collection, pour réutiliser les calculs. */
export function toSharedEntries(rows: SharedRow[]): Entry[] {
  return withoutSupersededWishes(
    rows.map((row) => ({
      id: row.isbn,
      status: row.status === 'wanted' ? ('wanted' as const) : ('owned' as const),
      read: row.read,
      price: null,
      condition: null,
      notes: null,
      acquiredOn: null,
      addedAt: null,
      dedication: row.dedicated ? ('signature' as const) : null,
      dedicationBy: null,
      firstEdition: false,
      edition: {
        isbn: row.isbn,
        title: row.title,
        volume: row.volume,
        authors: row.authors,
        publisher: null,
        publishedOn: null,
        coverUrl: row.coverUrl,
        kind: toAlbumKind(row.kind),
        volumeFrom: row.volumeFrom,
        volumeTo: row.volumeTo,
        series: row.seriesId
          ? {
              id: row.seriesId,
              name: row.seriesName ?? '',
              totalVolumes: row.seriesTotal,
              publicationStatus: toPublicationStatus(row.seriesStatus),
              startsAtZero: row.startsAtZero,
            }
          : null,
      },
    })),
  )
}

export interface SharedSummary {
  seriesCount: number
  ownedCount: number
  wantedCount: number
}

export function sharedSummary(entries: Entry[]): SharedSummary {
  const owned = entries.filter((entry) => entry.status === 'owned')
  return {
    seriesCount: new Set(owned.flatMap((entry) => entry.edition.series?.id ?? [])).size,
    ownedCount: owned.length,
    wantedCount: entries.length - owned.length,
  }
}

/** Cartes de la grille publique : une par série (ou « Albums hors série »), pour un onglet. */
export function sharedCards(entries: Entry[], status: Status, token: string): GridCard[] {
  const visible = entries.filter((entry) => entry.status === status)
  return groupBySeries(visible).map((group) => {
    const owned = status === 'owned'
    const tomes = group.entries.filter((entry) => !isOutsideGrid(entry.edition.kind))
    const volumes = tomes.flatMap((entry) =>
      entry.edition.volume === null ? [] : [entry.edition.volume],
    )
    const total = effectiveTotal(group.totalVolumes, volumes)
    const progress = seriesProgress({
      total,
      ownedVolumes: volumes,
      ignored: [],
      ownsIntegral: tomes.length < group.entries.length,
      hasVolumeZero: group.startsAtZero,
    })
    const showProgress = owned && group.name !== null && !!total && progress.target > 0
    return {
      key: group.key,
      to: `/partage/${token}/${group.key}`,
      name: group.name ?? 'Albums hors série',
      coverUrl: seriesCoverUrl(group.entries),
      owned: owned && total ? progress.owned : group.entries.length,
      target: owned && total ? progress.target : null,
      readCount: group.entries.filter((entry) => entry.read).length,
      albumCount: group.entries.length,
      publication: group.publicationStatus,
      complete: showProgress && progress.complete,
      showProgress,
    }
  })
}

/** Adresse publique de la collection (le routeur est en mode hash). */
export function shareUrl(token: string, base = window.location.href): string {
  return `${base.split('#')[0]}#/partage/${token}`
}
