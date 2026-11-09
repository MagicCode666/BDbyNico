import { describe, expect, it } from 'vitest'

import { ImportFormatError, parseBubbleCsv, parseVolume } from './bubble'
import { toEditionPayload } from './payload'

const HEADER = [
  'Titre de la série',
  'Type',
  'Collection',
  'Catégory',
  "Titre de l'album",
  'EAN',
  'Identifiant Bubble',
  'Tome',
  'Date de publication',
  'Editeur',
  'Auteurs',
  'Prix',
  "Date d'ajout",
  'Dans ma collection',
  'Lu',
  'Dédicacé',
  'Edition originale',
]
const q = (value: string) => `"${value}"`

interface Line {
  serie?: string
  album?: string
  ean?: string
  tome?: string
  date?: string
  editeur?: string
  auteurs?: string
  prix?: string
  ajout?: string
  possede?: boolean
  lu?: boolean
  dedicace?: boolean
  originale?: boolean
}

function line(l: Line): string {
  return [
    l.serie ?? 'Série',
    '',
    '',
    'BD',
    l.album ?? 'Album',
    l.ean ?? '9782203001176',
    'id',
    l.tome ?? '',
    l.date ?? '2010-09-01T00:00:00.000Z',
    l.editeur ?? 'Casterman',
    l.auteurs ?? 'Hergé',
    l.prix ?? '13.90',
    l.ajout ?? '2023-04-06T16:41:47.742Z',
    l.possede === false ? '' : '✓',
    l.lu ? '✓' : '',
    l.dedicace ? '✓' : '',
    l.originale ? '✓' : '',
  ]
    .map(q)
    .join(';')
}

const csv = (...lines: Line[]) => [HEADER.map(q).join(';'), ...lines.map(line)].join('\r\n')

describe('parseVolume', () => {
  it.each([
    ['12', 12],
    ['', null],
    ['0', null],
    ['1989', null],
    ['2020', null],
    ['1000', null],
    ['abc', null],
    ['3,5', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseVolume(input).volume).toBe(expected)
  })
  it('explique pourquoi un tome est écarté', () => {
    expect(parseVolume('1989').warning).toContain('année')
    expect(parseVolume('0').warning).toContain('sans numéro')
    expect(parseVolume('').warning).toBeUndefined()
  })
})

describe('parseBubbleCsv', () => {
  it("lit les champs d'une ligne complète", () => {
    const plan = parseBubbleCsv(
      csv({
        serie: 'Tintin',
        album: "L'Affaire Tournesol",
        tome: '18',
        auteurs: 'Hergé,Un Autre',
        prix: '13.90',
        lu: true,
        originale: true,
      }),
    )
    expect(plan.skipped).toEqual([])
    expect(plan.rows).toHaveLength(1)
    expect(plan.rows[0]).toEqual({
      isbn: '9782203001176',
      title: "L'Affaire Tournesol",
      titleMissing: false,
      seriesName: 'Tintin',
      volume: 18,
      authors: ['Hergé', 'Un Autre'],
      publisher: 'Casterman',
      publishedOn: '2010-09-01',
      status: 'owned',
      read: true,
      price: 13.9,
      addedAt: '2023-04-06T16:41:47.742Z',
      dedication: null,
      firstEdition: true,
      dedicationBy: null,
      acquiredOn: null,
      condition: null,
      notes: null,
    })
  })

  it('lit le type de dédicace de nos exports, et « signature » pour la simple case Bubble', () => {
    const header = HEADER.concat(['Type de dédicace', 'Dédicace par']).map(q).join(';')
    const make = (type: string, by: string, flag: string) =>
      [
        'S',
        '',
        '',
        'BD',
        'A',
        '9782203001176',
        'id',
        '1',
        '',
        '',
        '',
        '',
        '',
        '✓',
        '',
        flag,
        '',
        type,
        by,
      ]
        .map(q)
        .join(';')
    expect(parseBubbleCsv([header, make('dessin', 'Zep', '✓')].join('\r\n')).rows[0]).toMatchObject(
      { dedication: 'drawing', dedicationBy: 'Zep' },
    )
    expect(parseBubbleCsv([header, make('', '', '✓')].join('\r\n')).rows[0]).toMatchObject({
      dedication: 'signature',
      dedicationBy: null,
    })
    // Pas de dédicace : l'auteur éventuel est ignoré
    expect(parseBubbleCsv([header, make('', 'Zep', '')].join('\r\n')).rows[0]).toMatchObject({
      dedication: null,
      dedicationBy: null,
    })
  })

  it('supporte le BOM, les points-virgules et guillemets dans les champs', () => {
    const plan = parseBubbleCsv(
      '﻿' + csv({ album: 'Titre ; avec point-virgule', serie: 'S' }).replace('Album', 'x'),
    )
    expect(plan.rows[0].title).toBe('Titre ; avec point-virgule')
  })

  it("importe en « envie » ce qui n'est pas dans la collection", () => {
    const plan = parseBubbleCsv(csv({ possede: false, lu: true }))
    expect(plan.rows[0].status).toBe('wanted')
    expect(plan.rows[0].read).toBe(true)
    expect(plan.stats).toMatchObject({ owned: 0, wanted: 1, read: 1 })
  })

  it('importe le drapeau « dédicacé » comme signature', () => {
    const plan = parseBubbleCsv(csv({ dedicace: true }))
    expect(plan.rows[0].dedication).toBe('signature')
    expect(plan.stats.dedicated).toBe(1)
  })

  it('traite un album seul (titre = série, sans tome) comme sans série', () => {
    const plan = parseBubbleCsv(csv({ serie: '1984', album: '1984' }))
    expect(plan.rows[0].seriesName).toBeNull()
  })

  it("garde la série quand l'album a un tome, même si les titres sont identiques", () => {
    const plan = parseBubbleCsv(csv({ serie: 'Gaston', album: 'Gaston', tome: '1' }))
    expect(plan.rows[0].seriesName).toBe('Gaston')
  })

  it('ignore les tomes aberrants avec un avertissement', () => {
    const plan = parseBubbleCsv(
      csv(
        { serie: 'Astérix', album: 'Hors numérotation', tome: '1989', ean: '9782203001176' },
        { serie: 'Trilogie', album: 'Zéro', tome: '0', ean: '9782800116303' },
      ),
    )
    expect(plan.rows.map((r) => r.volume)).toEqual([null, null])
    expect(plan.warnings).toHaveLength(2)
    expect(plan.warnings[0]).toMatchObject({ line: 2 })
    expect(plan.warnings[1]).toMatchObject({ line: 3 })
  })

  it('marque les titres absents et propose un repli lisible', () => {
    const plan = parseBubbleCsv(csv({ serie: 'Légendes', album: '', tome: '3' }))
    expect(plan.rows[0].titleMissing).toBe(true)
    expect(plan.rows[0].title).toBe('Légendes - Tome 3')
    expect(plan.stats.titlesToComplete).toBe(1)
  })

  it('écarte les EAN invalides et les doublons du fichier', () => {
    const plan = parseBubbleCsv(
      csv(
        { ean: '9782203001176' },
        { ean: '9782203001176' },
        { ean: '9782203001177' },
        { ean: '' },
      ),
    )
    expect(plan.rows).toHaveLength(1)
    expect(plan.skipped.map((s) => s.line)).toEqual([3, 4, 5])
  })

  it('convertit un ISBN-10 en ISBN-13', () => {
    const plan = parseBubbleCsv(csv({ ean: '2-203-00117-8' }))
    expect(plan.skipped).toEqual([])
    expect(plan.rows.map((r) => r.isbn)).toEqual(['9782203001176'])
  })

  it('tolère les champs vides (éditeur, auteurs, date, prix)', () => {
    const plan = parseBubbleCsv(csv({ editeur: '', auteurs: '', date: '', prix: '' }))
    expect(plan.rows[0]).toMatchObject({
      publisher: null,
      authors: [],
      publishedOn: null,
      price: null,
    })
  })

  it('compte les séries distinctes sans tenir compte des accents ni de la casse', () => {
    const plan = parseBubbleCsv(
      csv(
        { serie: 'Androïdes', tome: '1', ean: '9782203001176' },
        { serie: 'ANDROIDES', tome: '2', ean: '9782800116303' },
        { serie: 'Autre', tome: '1', ean: '9782302051874' },
      ),
    )
    expect(plan.stats.series).toBe(2)
  })

  it("refuse un fichier qui n'est pas un export Bubble", () => {
    expect(() => parseBubbleCsv('a;b;c\r\n1;2;3')).toThrow(ImportFormatError)
    expect(() => parseBubbleCsv('')).toThrow(ImportFormatError)
  })
})

describe('toEditionPayload', () => {
  it('prépare la ligne envoyée au serveur', () => {
    const [row] = parseBubbleCsv(csv({ serie: 'Tintin', album: 'Tournesol', tome: '18' })).rows
    expect(toEditionPayload(row)).toEqual({
      isbn: '9782203001176',
      title: 'Tournesol',
      series: 'Tintin',
      volume: 18,
      authors: ['Hergé'],
      publisher: 'Casterman',
      published_on: '2010-09-01',
    })
  })
})
