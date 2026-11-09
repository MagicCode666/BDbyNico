import { describe, expect, it } from 'vitest'

import type { Entry } from './types'
import { filterEntries, groupBySeries, normalizeText, progressLabel } from './utils'

function entry(
  overrides: Partial<Entry> & { title?: string; seriesName?: string; volume?: number },
): Entry {
  const { title = 'Titre', seriesName, volume, ...rest } = overrides
  return {
    id: `${seriesName ?? 'x'}-${title}-${volume ?? 0}`,
    status: 'owned',
    read: false,
    price: null,
    condition: null,
    notes: null,
    acquiredOn: null,
    edition: {
      isbn: '9782070612758',
      title,
      volume: volume ?? null,
      authors: ['Goscinny'],
      publisher: null,
      publishedOn: null,
      coverUrl: null,
      series: seriesName ? { id: seriesName, name: seriesName, totalVolumes: 10 } : null,
    },
    ...rest,
  }
}

describe('normalizeText', () => {
  it('retire accents et casse', () => {
    expect(normalizeText('Astérix À Rome')).toBe('asterix a rome')
  })
})

describe('filterEntries', () => {
  const entries = [
    entry({ title: 'Le Gaulois', seriesName: 'Astérix', volume: 1 }),
    entry({ title: 'Lu déjà', seriesName: 'Tintin', volume: 1, read: true }),
    entry({ title: 'Souhait', seriesName: 'Tintin', volume: 2, status: 'wanted' }),
  ]
  const base = { status: 'owned' as const, query: '', read: 'all' as const }

  it('filtre par statut', () => {
    expect(filterEntries(entries, base)).toHaveLength(2)
    expect(filterEntries(entries, { ...base, status: 'wanted' })).toHaveLength(1)
  })
  it('filtre lu / non lu', () => {
    expect(filterEntries(entries, { ...base, read: 'read' }).map((e) => e.edition.title)).toEqual([
      'Lu déjà',
    ])
    expect(filterEntries(entries, { ...base, read: 'unread' })).toHaveLength(1)
  })
  it('cherche par titre, série ou auteur sans tenir compte des accents', () => {
    expect(filterEntries(entries, { ...base, query: 'asterix' })).toHaveLength(1)
    expect(filterEntries(entries, { ...base, query: 'GOSCINNY' })).toHaveLength(2)
    expect(filterEntries(entries, { ...base, query: 'deja' })).toHaveLength(1)
    expect(filterEntries(entries, { ...base, query: 'zzz' })).toHaveLength(0)
  })
})

describe('groupBySeries', () => {
  it('regroupe par série, trie les tomes et met les albums hors série à la fin', () => {
    const groups = groupBySeries([
      entry({ title: 'Hors série' }),
      entry({ title: 'B', seriesName: 'Tintin', volume: 2 }),
      entry({ title: 'A', seriesName: 'Astérix', volume: 1 }),
      entry({ title: 'C', seriesName: 'Tintin', volume: 1 }),
    ])
    expect(groups.map((g) => g.name)).toEqual(['Astérix', 'Tintin', null])
    expect(groups[1].entries.map((e) => e.edition.title)).toEqual(['C', 'B'])
  })
})

describe('progressLabel', () => {
  const [group] = groupBySeries([entry({ seriesName: 'Astérix', volume: 1 })])
  it('affiche la progression avec le total connu', () => {
    expect(progressLabel(group, 3)).toBe('3 / 10 tomes')
  })
  it('accorde le singulier et le pluriel sans total', () => {
    const noTotal = { ...group, totalVolumes: null }
    expect(progressLabel(noTotal, 1)).toBe('1 tome')
    expect(progressLabel(noTotal, 2)).toBe('2 tomes')
  })
})
