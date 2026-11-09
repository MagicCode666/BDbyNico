import { describe, expect, it } from 'vitest'

import {
  cleanSeriesName,
  computeSeries,
  decodeEntities,
  nameKey,
  parseNotices,
  parseVolume,
} from './bnf-series.mjs'

const field = (tag, subs) =>
  `<mxc:datafield tag="${tag}" ind1=" " ind2=" ">${subs
    .map(([code, value]) => `<mxc:subfield code="${code}">${value}</mxc:subfield>`)
    .join('')}</mxc:datafield>`

function notice({ title = 'Un album', series, volume, isbn, year = '2000', mention }) {
  const fields = [
    field('200', [['a', title]]),
    field('210', [
      ['c', 'Dupuis'],
      ['d', year],
    ]),
  ]
  if (series)
    fields.push(
      field(
        '225',
        volume
          ? [
              ['a', series],
              ['v', volume],
            ]
          : [['a', series]],
      ),
    )
  if (isbn) fields.push(field('010', [['a', isbn]]))
  if (mention) fields.push(field('205', [['a', mention]]))
  return `<srw:record><srw:recordData><mxc:record>${fields.join('')}</mxc:record></srw:recordData></srw:record>`
}

const xml = (...notices) =>
  `<srw:searchRetrieveResponse>${notices.join('')}</srw:searchRetrieveResponse>`

describe('parseVolume', () => {
  it.each([
    ['1', 1],
    ['T. 12', 12],
    ['56', 56],
    ['1-3', null],
    ['1 à 3', null],
    ['2/3', null],
    ['', null],
    [undefined, null],
    ['0', null],
    ['5000', null],
  ])('%s -> %s', (input, expected) => {
    expect(parseVolume(input)).toBe(expected)
  })
})

describe('noms de série', () => {
  it('nettoie la ponctuation de la BnF', () => {
    expect(cleanSeriesName('Spirou et Fantasio . Hors-série .')).toBe(
      'Spirou et Fantasio. Hors-série',
    )
  })
  it('compare sans tenir compte des accents ni de la casse', () => {
    expect(nameKey('Androïdes')).toBe(nameKey('androides'))
    expect(nameKey('Les Aventures de Tintin')).not.toBe(nameKey('Tintin'))
  })
  it('décode les entités XML', () => {
    expect(decodeEntities('Tom &amp; Jerry &#233;t&#xe9;')).toBe('Tom & Jerry été')
  })
})

describe('computeSeries', () => {
  const notices = parseNotices(
    xml(
      notice({ title: 'Un', series: 'Ma série', volume: '1', isbn: '2-203-00117-8' }),
      notice({
        title: 'Deux',
        series: 'Ma série',
        volume: '2',
        isbn: '978-2-8001-1630-3',
        year: '1990',
      }),
      // même tome, réédition plus récente avec ISBN : on garde la plus ancienne
      notice({
        title: 'Deux bis',
        series: 'Ma série',
        volume: '2',
        isbn: '9782203001176',
        year: '2010',
      }),
      notice({ title: 'Trois', series: 'Ma série', volume: '3' }),
      // tome spécial numéroté hors séquence : écarté
      notice({ title: 'Collector', series: 'Ma série', volume: '57', mention: 'Éd. collector' }),
      // recueil numéroté : écarté
      notice({ title: 'Recueil', series: 'Ma série', volume: '9', mention: 'Tirage de tête' }),
      // plage : écartée
      notice({ title: 'Double', series: 'Ma série', volume: '4-5' }),
      // sans numéro : écarté
      notice({ title: 'Sans numéro', series: 'Ma série' }),
      // autre série : ignorée
      notice({ title: 'Autre', series: 'Autre série', volume: '99' }),
    ),
  )
  const result = computeSeries(notices, 'Ma série')

  it('retient le plus grand tome numéroté non spécial comme total', () => {
    expect(result.total).toBe(3)
  })
  it('compte les notices écartées', () => {
    expect(result.matched).toBe(8)
    expect(result.skipped).toEqual({ sansNumero: 2, special: 2 })
  })
  it('garde un album par tome, en préférant ISBN puis la plus ancienne édition', () => {
    expect(result.albums.map((a) => a.volume)).toEqual([1, 2, 3])
    expect(result.albums[0].isbn).toBe('9782203001176')
    expect(result.albums[1].title).toBe('Deux')
    expect(result.albums[2].isbn).toBeUndefined()
  })
  it('juge le total fiable quand la BnF référence assez de tomes', () => {
    expect(result.coverage).toBe(1)
    expect(result.reliable).toBe(true)
  })
  it('juge le total douteux quand trop de tomes manquent', () => {
    const sparse = parseNotices(
      xml(
        notice({ series: 'S', volume: '1', isbn: '2-203-00117-8' }),
        notice({ series: 'S', volume: '40', isbn: '978-2-8001-1630-3' }),
      ),
    )
    const sparseResult = computeSeries(sparse, 'S')
    expect(sparseResult.total).toBe(40)
    expect(sparseResult.reliable).toBe(false)
  })
  it('renvoie un total nul quand rien ne correspond', () => {
    expect(computeSeries(notices, 'Inconnue').total).toBeNull()
  })
})
