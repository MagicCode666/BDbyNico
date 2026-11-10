import { describe, expect, it } from 'vitest'

import type { Entry } from '../collection/types'
import { parseBubbleCsv } from '../import/bubble'
import { entriesToCsv, escapeCell, exportFileName } from './exportCsv'

function entry(overrides: Partial<Entry> = {}, edition: Partial<Entry['edition']> = {}): Entry {
  return {
    id: 'id',
    status: 'owned',
    read: false,
    price: null,
    condition: null,
    notes: null,
    acquiredOn: null,
    addedAt: '2023-04-06T16:41:47.742Z',
    dedication: null,
    dedicationBy: null,
    firstEdition: false,
    edition: {
      isbn: '9782203001176',
      title: 'Tournesol',
      volume: 18,
      authors: ['Hergé', 'Autre'],
      publisher: 'Casterman',
      publishedOn: '1956-01-01',
      coverUrl: null,
      series: { id: 's1', name: 'Tintin', totalVolumes: 24 },
      ...edition,
    },
    ...overrides,
  }
}

describe('escapeCell', () => {
  it('entoure de guillemets et double ceux du texte', () => {
    expect(escapeCell('Il dit "oui"')).toBe('"Il dit ""oui"""')
  })
  it('neutralise les débuts de formule des tableurs', () => {
    expect(escapeCell('=SOMME(A1)')).toBe(`"'=SOMME(A1)"`)
    expect(escapeCell('+33 1')).toBe(`"'+33 1"`)
    expect(escapeCell('@cmd')).toBe(`"'@cmd"`)
    expect(escapeCell('Texte normal')).toBe('"Texte normal"')
  })
})

describe('entriesToCsv', () => {
  it("commence par un BOM et une ligne d'en-tête, séparée par des points-virgules", () => {
    const csv = entriesToCsv([entry()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const [header, line] = csv.slice(1).split('\r\n')
    expect(header.startsWith('"Titre de la série";"Titre de l\'album";"EAN"')).toBe(true)
    expect(line).toContain('"Tintin";"Tournesol";"9782203001176";"18"')
  })

  it('trie par série (albums sans série à la fin), puis par tome', () => {
    const csv = entriesToCsv([
      entry({}, { title: 'Seul', series: null, volume: null, isbn: '9782800116303' }),
      entry({}, { title: 'B', volume: 2, isbn: '9782302051874' }),
      entry({}, { title: 'A', volume: 1, isbn: '9782203001176' }),
    ])
    const titles = csv
      .slice(1)
      .split('\r\n')
      .slice(1, 4)
      .map((line) => line.split(';')[1])
    expect(titles).toEqual(['"A"', '"B"', '"Seul"'])
  })

  it('génère un nom de fichier daté', () => {
    expect(exportFileName(new Date('2026-11-09T12:00:00Z'))).toBe(
      'bdbynico-collection-2026-11-09.csv',
    )
  })
})

describe('export puis réimport (sans perte)', () => {
  it('restitue chaque champ de la collection', () => {
    const original = [
      entry(
        {
          status: 'owned',
          read: true,
          price: 13.9,
          condition: 'Bon état',
          notes: 'Une "belle" note;\navec saut de ligne',
          acquiredOn: '2021-06-12',
          dedication: 'drawing',
          dedicationBy: 'Zep',
          firstEdition: true,
        },
        { title: 'Titre ; avec "guillemets"', volume: 3, isbn: '9782203001176' },
      ),
      entry(
        { status: 'wanted', dedication: 'signature', dedicationBy: 'Hergé' },
        { title: 'Envie', volume: 4, isbn: '9782800116303' },
      ),
      entry(
        { notes: '=1+1' },
        { title: 'Album seul', series: null, volume: null, isbn: '9782302051874', authors: [] },
      ),
    ]
    const plan = parseBubbleCsv(entriesToCsv(original))

    expect(plan.skipped).toEqual([])
    expect(plan.rows).toHaveLength(3)
    const byIsbn = Object.fromEntries(plan.rows.map((r) => [r.isbn, r]))

    expect(byIsbn['9782203001176']).toMatchObject({
      title: 'Titre ; avec "guillemets"',
      seriesName: 'Tintin',
      volume: 3,
      authors: ['Hergé', 'Autre'],
      publisher: 'Casterman',
      status: 'owned',
      read: true,
      price: 13.9,
      condition: 'Bon état',
      notes: 'Une "belle" note;\navec saut de ligne',
      acquiredOn: '2021-06-12',
      dedication: 'drawing',
      dedicationBy: 'Zep',
      firstEdition: true,
      addedAt: '2023-04-06T16:41:47.742Z',
    })
    expect(byIsbn['9782800116303']).toMatchObject({
      status: 'wanted',
      dedication: 'signature',
      dedicationBy: 'Hergé',
    })
    expect(byIsbn['9782302051874']).toMatchObject({
      seriesName: null,
      volume: null,
      notes: '=1+1', // l'apostrophe de protection est retirée
    })
  })
})

describe('export puis réimport des intégrales et hors-séries', () => {
  it('conserve le type et la plage de tomes', () => {
    const original = [
      entry(
        {},
        {
          title: 'La trilogie du mal',
          volume: null,
          isbn: '9782822225632',
          kind: 'integral',
          volumeFrom: 1,
          volumeTo: 3,
        },
      ),
      entry(
        {},
        { title: 'Intégrale complète', volume: null, isbn: '9782756024189', kind: 'integral' },
      ),
      entry({}, { title: 'Hors-série', volume: null, isbn: '9782864972129', kind: 'special' }),
      entry({}, { title: 'Tome ordinaire', volume: 2, isbn: '9782800116303' }),
    ]
    const csv = entriesToCsv(original)
    expect(csv).toContain('"intégrale complète";"1";"3"')
    expect(csv).toContain('"hors série";"";""')
    expect(csv).toContain('"album simple";"";""')

    const byIsbn = Object.fromEntries(parseBubbleCsv(csv).rows.map((r) => [r.isbn, r]))
    expect(byIsbn['9782822225632']).toMatchObject({ kind: 'integral', volumeFrom: 1, volumeTo: 3 })
    expect(byIsbn['9782756024189']).toMatchObject({
      kind: 'integral',
      volumeFrom: null,
      volumeTo: null,
    })
    expect(byIsbn['9782864972129']).toMatchObject({ kind: 'special', volumeFrom: null })
    expect(byIsbn['9782800116303']).toMatchObject({ kind: 'album', volume: 2 })
  })
})
