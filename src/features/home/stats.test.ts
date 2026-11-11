import { describe, expect, it } from 'vitest'

import type { Entry } from '../collection/types'
import { dashboardStats } from './stats'

const series = (id: string, total: number | null) => ({
  id,
  name: `Série ${id}`,
  totalVolumes: total,
  publicationStatus: null,
  startsAtZero: false,
})

let counter = 0
const entry = (
  seriesId: string | null,
  volume: number | null,
  extra: Partial<Entry> & { total?: number | null; kind?: 'album' | 'integral' } = {},
): Entry => {
  counter++
  const { total = 5, kind = 'album', ...rest } = extra
  return {
    id: `item-${counter}`,
    status: 'owned',
    price: null,
    condition: null,
    notes: null,
    acquiredOn: null,
    addedAt: `2026-01-${String(counter).padStart(2, '0')}T10:00:00Z`,
    dedication: null,
    dedicationBy: null,
    firstEdition: false,
    edition: {
      isbn: `isbn-${counter}`,
      title: `Album ${counter}`,
      volume,
      authors: [],
      publisher: null,
      publishedOn: null,
      coverUrl: volume === 1 ? `cover-${seriesId}` : null,
      series: seriesId ? series(seriesId, total) : null,
      kind,
    },
    ...rest,
  }
}

describe('dashboardStats', () => {
  it('compte possédés, envies, lus et séries', () => {
    const stats = dashboardStats(
      [
        entry('a', 1),
        entry('a', 2),
        entry('b', 1),
        entry('b', 2, { status: 'wanted' }),
        entry(null, null),
      ],
      undefined,
    )
    expect(stats).toMatchObject({ owned: 4, wanted: 1, seriesCount: 2 })
  })

  it('classe les séries à compléter, la plus proche de la fin en premier', () => {
    const stats = dashboardStats(
      [
        ...[1, 2, 3].map((v) => entry('loin', v, { total: 10 })),
        ...[1, 2, 3, 4].map((v) => entry('proche', v, { total: 5 })),
        ...[1, 2].map((v) => entry('finie', v, { total: 2 })),
      ],
      undefined,
    )
    expect(stats.inProgress.map((s) => s.id)).toEqual(['proche', 'loin'])
    expect(stats.inProgress[0]).toMatchObject({
      owned: 4,
      target: 5,
      missing: [5],
      coverUrl: 'cover-proche',
    })
    expect(stats.completeCount).toBe(1)
  })

  it('tient compte des tomes exclus et des intégrales', () => {
    const stats = dashboardStats(
      [
        entry('s', 1, { total: 3 }),
        entry('s', 3, { total: 3 }),
        entry('t', null, { total: 3, kind: 'integral' }),
      ],
      new Map([['s', { ignored: [2], totalOverride: null }]]),
    )
    expect(stats.completeCount).toBe(1)
    expect(stats.inProgress.map((s) => s.id)).toEqual(['t'])
  })

  it('garde les derniers ajouts, le plus récent en premier', () => {
    const entries = [1, 2, 3, 4].map((v) => entry('a', v))
    const stats = dashboardStats(entries, undefined, 2)
    expect(stats.recent.map((e) => e.edition.volume)).toEqual([4, 3])
  })
})
