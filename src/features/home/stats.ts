import { isOutsideGrid } from '../collection/kinds'
import type { Entry } from '../collection/types'
import { effectiveTotal } from '../collection/utils'
import type { SeriesSettings } from '../series/api'
import { seriesProgress } from '../series/progress'

export interface SeriesStat {
  id: string
  name: string
  owned: number
  target: number
  complete: boolean
  /** Une cover à montrer : celle d'un tome possédé, le plus petit numéro d'abord. */
  coverUrl: string | null
  missing: number[]
}

export interface DashboardStats {
  owned: number
  wanted: number
  read: number
  seriesCount: number
  completeCount: number
  /** Séries à compléter, les plus proches du but d'abord. */
  inProgress: SeriesStat[]
  /** Derniers albums ajoutés (possédés ou en envie), le plus récent d'abord. */
  recent: Entry[]
}

/** Chiffres de l'accueil, calculés comme sur la page Collection (mêmes règles de progression). */
export function dashboardStats(
  entries: Entry[],
  settings: Map<string, SeriesSettings> | undefined,
  recentCount = 10,
): DashboardStats {
  const owned = entries.filter((entry) => entry.status === 'owned')
  const bySeries = new Map<string, Entry[]>()
  for (const entry of owned) {
    const series = entry.edition.series
    if (!series) continue
    bySeries.set(series.id, [...(bySeries.get(series.id) ?? []), entry])
  }

  const stats: SeriesStat[] = []
  for (const [id, items] of bySeries) {
    const series = items[0].edition.series!
    const tomes = items.filter((entry) => !isOutsideGrid(entry.edition.kind))
    const volumes = tomes.flatMap((entry) =>
      entry.edition.volume === null ? [] : [entry.edition.volume],
    )
    const own = settings?.get(id)
    const total = effectiveTotal(own?.totalOverride ?? series.totalVolumes, volumes)
    const progress = seriesProgress({
      total,
      ownedVolumes: volumes,
      ignored: own?.ignored ?? [],
      ownsIntegral: tomes.length < items.length,
      hasVolumeZero: series.startsAtZero,
    })
    const cover = [...tomes]
      .sort((a, b) => (a.edition.volume ?? 9999) - (b.edition.volume ?? 9999))
      .find((entry) => entry.edition.coverUrl)
    stats.push({
      id,
      name: series.name,
      owned: total ? progress.owned : tomes.length,
      target: total ? progress.target : 0,
      complete: !!total && progress.complete,
      coverUrl: cover?.edition.coverUrl ?? null,
      missing: progress.missing,
    })
  }

  const inProgress = stats
    .filter((stat) => !stat.complete && stat.target > 0 && stat.missing.length > 0)
    // Les plus proches de la fin d'abord : peu de tomes manquants, puis le plus avancé
    .sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.owned / b.target - a.owned / a.target ||
        a.name.localeCompare(b.name, 'fr'),
    )

  const recent = [...entries]
    .filter((entry) => entry.addedAt)
    .sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? ''))
    .slice(0, recentCount)

  return {
    owned: owned.length,
    wanted: entries.length - owned.length,
    read: owned.filter((entry) => entry.read).length,
    seriesCount: bySeries.size,
    completeCount: stats.filter((stat) => stat.complete).length,
    inProgress,
    recent,
  }
}
