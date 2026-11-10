import { isbn13To10 } from '../../../lib/isbn'
import { imageExists } from './amazon'
import { toIsoDate } from './dates'
import type { BookInfo } from './types'

const SRU_URL = 'https://catalogue.bnf.fr/api/SRU'

function datafields(record: Element, tags: string[]): Element[] {
  return [...record.getElementsByTagNameNS('*', 'datafield')].filter((el) =>
    tags.includes(el.getAttribute('tag') ?? ''),
  )
}

function subfields(field: Element, code: string): string[] {
  return [...field.getElementsByTagNameNS('*', 'subfield')]
    .filter((el) => el.getAttribute('code') === code)
    .map((el) => el.textContent?.trim() ?? '')
    .filter(Boolean)
}

const first = (field: Element | undefined, code: string) =>
  field ? subfields(field, code)[0] : undefined

/** « Spirou et Fantasio . Hors-série . » → « Spirou et Fantasio. Hors-série » */
function cleanSeriesName(name: string): string {
  return name.replace(/\s+\./g, '.').replace(/\.+$/, '').trim()
}

/** Extrait un numéro de tome d'une zone « 225 $v » (« 1 », « T. 12 », « 3, partie 2 »). */
function parseVolume(text: string | undefined): number | undefined {
  const digits = text?.match(/\d+/)?.[0]
  return digits ? Number(digits) : undefined
}

/** Lit une réponse SRU de la BnF (format UNIMARC) et en tire les informations de l'album. */
export function parseBnfResponse(xml: string): BookInfo | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const record = doc.getElementsByTagNameNS('*', 'record')[0]
  if (!record) return null

  const field200 = datafields(record, ['200'])[0]
  const title = first(field200, 'a')
  if (!title) return null

  const field210 = datafields(record, ['210', '214'])[0]
  const field225 = datafields(record, ['225'])[0]

  const authors: string[] = []
  for (const field of datafields(record, ['700', '701', '702'])) {
    const lastName = first(field, 'a')
    if (!lastName) continue
    const name = [first(field, 'b'), lastName].filter(Boolean).join(' ')
    if (!authors.includes(name)) authors.push(name)
  }

  const seriesRaw = first(field225, 'a')
  return {
    title,
    seriesName: seriesRaw ? cleanSeriesName(seriesRaw) : undefined,
    volume: parseVolume(first(field225, 'v')),
    authors,
    publisher: first(field210, 'c'),
    publishedOn: toIsoDate(first(field210, 'd')),
  }
}

/** Interroge le catalogue de la BnF à partir d'un ISBN-13 (et de sa forme ISBN-10). */
async function fetchBnfRecord(isbn13: string): Promise<string> {
  // Les notices anciennes ne sont indexées que par ISBN-10 : on cherche les deux formes.
  const isbn10 = isbn13To10(isbn13)
  const query = [isbn13, isbn10]
    .filter(Boolean)
    .map((isbn) => `bib.isbn adj "${isbn}"`)
    .join(' or ')
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query,
    recordSchema: 'unimarcxchange',
    maximumRecords: '1',
  })
  const response = await fetch(`${SRU_URL}?${params}`, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`BnF : HTTP ${response.status}`)
  return response.text()
}

export async function lookupBnf(isbn13: string): Promise<BookInfo | null> {
  return parseBnfResponse(await fetchBnfRecord(isbn13))
}

/** Identifiant (ark) de la première notice d'une réponse SRU, ex. « cb41492610m ». */
export function parseBnfArk(xml: string): string | undefined {
  return xml.match(/ark:\/12148\/(cb[0-9a-z]+)/)?.[1]
}

/** Adresse de la couverture d'une notice. Le service répond par une erreur sans couverture. */
export function bnfCoverUrl(ark: string): string {
  return `https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/${ark}&couverture=1`
}

/** Couverture de la BnF pour un ISBN-13, si le catalogue en a une (vérifiée en la chargeant). */
export async function findBnfCover(isbn13: string): Promise<string | undefined> {
  try {
    const ark = parseBnfArk(await fetchBnfRecord(isbn13))
    if (!ark) return undefined
    const url = bnfCoverUrl(ark)
    return (await imageExists(url)) ? url : undefined
  } catch {
    return undefined
  }
}
