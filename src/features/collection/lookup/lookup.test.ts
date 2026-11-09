import { describe, expect, it } from 'vitest'

import { isbn13To10 } from '../../../lib/isbn'
import { amazonCoverUrl } from './amazon'
import { parseBnfResponse } from './bnf'
import { toIsoDate } from './dates'
import { mergeBookInfo } from './merge'
import { parseOpenLibrary, parseSeries } from './openLibrary'

function bnfXml(fields: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<srw:searchRetrieveResponse xmlns:srw="http://www.loc.gov/zing/srw/">
  <srw:records><srw:record><srw:recordData>
    <mxc:record xmlns:mxc="info:lc/xmlns/marcxchange-v2">${fields}</mxc:record>
  </srw:recordData></srw:record></srw:records>
</srw:searchRetrieveResponse>`
}

const field = (tag: string, subs: [string, string][]) =>
  `<mxc:datafield tag="${tag}" ind1=" " ind2=" ">${subs
    .map(([code, value]) => `<mxc:subfield code="${code}">${value}</mxc:subfield>`)
    .join('')}</mxc:datafield>`

describe('parseBnfResponse', () => {
  it('lit titre, série, tome, auteurs, éditeur et date', () => {
    const xml = bnfXml(
      [
        field('200', [
          ['a', "L'Héritage"],
          ['b', 'Texte imprimé'],
          ['f', 'Franquin'],
        ]),
        field('210', [
          ['a', '[Charleroi]'],
          ['c', 'Dupuis'],
          ['d', '1989'],
        ]),
        field('225', [
          ['a', 'Spirou et Fantasio . Hors-série .'],
          ['v', '1'],
        ]),
        field('700', [
          ['a', 'Franquin'],
          ['b', 'André'],
        ]),
        field('701', [['a', 'Franquin']]),
      ].join(''),
    )
    expect(parseBnfResponse(xml)).toEqual({
      title: "L'Héritage",
      seriesName: 'Spirou et Fantasio. Hors-série',
      volume: 1,
      authors: ['André Franquin', 'Franquin'],
      publisher: 'Dupuis',
      publishedOn: '1989-01-01',
    })
  })

  it('gère une notice sans série ni tome', () => {
    const xml = bnfXml(field('200', [['a', 'Un album']]) + field('210', [['c', 'Casterman']]))
    const info = parseBnfResponse(xml)
    expect(info?.title).toBe('Un album')
    expect(info?.seriesName).toBeUndefined()
    expect(info?.volume).toBeUndefined()
    expect(info?.authors).toEqual([])
  })

  it('renvoie null sans notice ou sans titre', () => {
    expect(
      parseBnfResponse(
        '<srw:searchRetrieveResponse xmlns:srw="x"><srw:records/></srw:searchRetrieveResponse>',
      ),
    ).toBeNull()
    expect(parseBnfResponse(bnfXml(field('210', [['c', 'X']])))).toBeNull()
  })
})

describe('parseSeries', () => {
  it('sépare le nom et le numéro de tome', () => {
    expect(parseSeries('Tintin (18)')).toEqual({ name: 'Tintin', volume: 18 })
    expect(parseSeries('Blake et Mortimer (T. 3)')).toEqual({
      name: 'Blake et Mortimer',
      volume: 3,
    })
  })
  it('garde le nom seul sans numéro', () => {
    expect(parseSeries('Lucky Luke')).toEqual({ name: 'Lucky Luke' })
    expect(parseSeries('')).toBeNull()
    expect(parseSeries(undefined)).toBeNull()
  })
})

describe('parseOpenLibrary', () => {
  it('extrait les informations et la couverture', () => {
    const info = parseOpenLibrary(
      {
        title: 'Spirou Hors-Série, tome 1',
        subtitle: "L'Héritage",
        authors: [{ name: 'André Franquin' }],
        publishers: [{ name: 'Dupuis' }],
        publish_date: 'January 11, 1989',
        cover: { large: 'https://covers.openlibrary.org/b/id/987119-L.jpg' },
      },
      { series: ['Spirou (1)'] },
    )
    expect(info).toEqual({
      title: "Spirou Hors-Série, tome 1 - L'Héritage",
      seriesName: 'Spirou',
      volume: 1,
      authors: ['André Franquin'],
      publisher: 'Dupuis',
      publishedOn: '1989-01-11',
      coverUrl: 'https://covers.openlibrary.org/b/id/987119-L.jpg',
    })
  })
  it('renvoie null sans titre (ISBN inconnu)', () => {
    expect(parseOpenLibrary(undefined)).toBeNull()
    expect(parseOpenLibrary({})).toBeNull()
  })
})

describe('toIsoDate', () => {
  it.each([
    ['1989', '1989-01-01'],
    ['July 1999', '1999-07-01'],
    ['January 11, 1989', '1989-01-11'],
    ['1989-03-02', '1989-03-02'],
    ['n.d.', undefined],
    ['', undefined],
  ])('%s -> %s', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })
})

describe('mergeBookInfo', () => {
  const bnf = {
    title: 'Titre BnF',
    seriesName: 'Série BnF',
    authors: ['Auteur BnF'],
    publisher: 'Éditeur BnF',
  }
  const ol = {
    title: 'Titre OL',
    seriesName: 'Série OL',
    volume: 7,
    authors: ['Auteur OL'],
    publisher: 'Éditeur OL',
    publishedOn: '2000-01-01',
    coverUrl: 'https://covers.openlibrary.org/x.jpg',
  }

  it('privilégie la BnF pour les textes et Open Library pour la couverture', () => {
    const result = mergeBookInfo(bnf, ol)
    expect(result?.source).toBe('bnf+openlibrary')
    expect(result?.info).toMatchObject({
      title: 'Titre BnF',
      seriesName: 'Série BnF',
      authors: ['Auteur BnF'],
      publisher: 'Éditeur BnF',
      publishedOn: '2000-01-01',
      coverUrl: 'https://covers.openlibrary.org/x.jpg',
    })
  })
  it("n'emprunte pas le tome d'Open Library quand la BnF donne une autre série", () => {
    expect(mergeBookInfo(bnf, ol)?.info.volume).toBeUndefined()
  })
  it("reprend le tome d'Open Library quand la BnF n'a pas de série", () => {
    const withoutSeries = { ...bnf, seriesName: undefined }
    expect(mergeBookInfo(withoutSeries, ol)?.info.volume).toBe(7)
  })
  it('gère une seule source ou aucune', () => {
    expect(mergeBookInfo(bnf, null)?.source).toBe('bnf')
    expect(mergeBookInfo(null, ol)?.source).toBe('openlibrary')
    expect(mergeBookInfo(null, null)).toBeNull()
  })
})

describe('amazonCoverUrl', () => {
  it("construit l'adresse à partir de l'ISBN-10", () => {
    expect(amazonCoverUrl('9782302051874')).toBe(
      'https://images-na.ssl-images-amazon.com/images/P/2302051874.01.LZZZZZZZ.jpg',
    )
  })
  it('renvoie null sans ISBN-10 équivalent (préfixe 979)', () => {
    expect(amazonCoverUrl('9791234567896')).toBeNull()
  })
})

describe('isbn13To10', () => {
  it('convertit un ISBN-13 en ISBN-10', () => {
    expect(isbn13To10('9782203001176')).toBe('2203001178')
    expect(isbn13To10('9782800116303')).toBe('2800116307')
    expect(isbn13To10('9780804429573')).toBe('080442957X')
  })
  it('renvoie null hors préfixe 978 ou si invalide', () => {
    expect(isbn13To10('9791234567896')).toBeNull()
    expect(isbn13To10('9782203001177')).toBeNull()
  })
})
