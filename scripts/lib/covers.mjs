// Remplacement des couvertures Open Library par celles d'Amazon quand elles existent.
// Open Library fournit parfois la page de titre du livre (presque blanche) au lieu de la couverture.
import { isbn13To10, normalizeIsbn } from '../../src/lib/isbn.ts'

export const OPEN_LIBRARY_PREFIX = 'https://covers.openlibrary.org/'
/** En dessous de cette taille, Amazon a renvoyé son image vide d'un pixel (une quarantaine d'octets). */
const MIN_COVER_BYTES = 1000

/** Adresse de la grande couverture Amazon (celle que l'application affiche), ou null. */
export function amazonCoverUrl(isbn13) {
  const isbn10 = isbn13To10(isbn13)
  return isbn10
    ? `https://images-na.ssl-images-amazon.com/images/P/${isbn10}.01.LZZZZZZZ.jpg`
    : null
}

/** Vérifie sur la petite version de l'image (quelques Ko) qu'Amazon a bien une couverture. */
export async function amazonCoverExists(isbn13, { fetchFn = fetch } = {}) {
  const url = amazonCoverUrl(isbn13)
  if (!url) return false
  const response = await fetchFn(url.replace('LZZZZZZZ', 'MZZZZZZZ'), {
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) return false
  if (!(response.headers.get('content-type') ?? '').startsWith('image/')) return false
  return (await response.arrayBuffer()).byteLength > MIN_COVER_BYTES
}

// --- Couvertures de la BnF -------------------------------------------------------------------
// Le service de couvertures du catalogue renvoie la vraie couverture (fournie par les éditeurs
// et libraires) ou une erreur 500 quand il n'en a pas. Il est adressé par l'identifiant (ark) de
// la notice, que l'on lit dans le catalogue à partir de l'ISBN.
const SRU_URL = 'https://catalogue.bnf.fr/api/SRU'
const MIN_BNF_COVER_BYTES = 5000

export function bnfCoverUrl(ark) {
  return `https://catalogue.bnf.fr/couverture?&appName=NE&idArk=ark:/12148/${ark}&couverture=1`
}

/** Associe à chaque ISBN-13 trouvé à la BnF l'adresse de la couverture de sa notice. */
export async function bnfCoverUrls(isbns, { fetchFn = fetch } = {}) {
  const wanted = new Set(isbns)
  const terms = isbns.flatMap((isbn) => [isbn, isbn13To10(isbn)]).filter(Boolean)
  const params = new URLSearchParams({
    version: '1.2',
    operation: 'searchRetrieve',
    query: `bib.isbn any "${terms.join(' ')}"`,
    recordSchema: 'unimarcxchange',
    maximumRecords: '50',
  })
  const response = await fetchFn(`${SRU_URL}?${params}`, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`BnF : HTTP ${response.status}`)
  const xml = await response.text()
  const urls = new Map()
  for (const [, record] of xml.matchAll(/<srw:record>(.*?)<\/srw:record>/gs)) {
    const ark = record.match(/ark:\/12148\/(cb[0-9a-z]+)/)?.[1]
    if (!ark) continue
    for (const [, field] of record.matchAll(
      /<mxc:datafield tag="010"[^>]*>(.*?)<\/mxc:datafield>/gs,
    )) {
      const value = field.match(/<mxc:subfield code="a">([^<]*)</)?.[1]
      const isbn = value ? normalizeIsbn(value) : undefined
      if (isbn && wanted.has(isbn) && !urls.has(isbn)) urls.set(isbn, bnfCoverUrl(ark))
    }
  }
  return urls
}

/** Vrai si le service a une vraie image (il répond par une erreur quand il n'en a pas). */
export async function bnfCoverExists(url, { fetchFn = fetch } = {}) {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(20000) })
  if (!response.ok) return false
  if (!(response.headers.get('content-type') ?? '').startsWith('image/')) return false
  return (await response.arrayBuffer()).byteLength > MIN_BNF_COVER_BYTES
}

// --- Couvertures de libraires (Decitre, AbeBooks) -------------------------------------------------
// Indexées par ISBN-13 : elles complètent Amazon (dont l'adresse suppose un ISBN-10, absent des
// ISBN en 979) et la BnF. Adresses non documentées, utilisées en repli seulement.
export const decitreCoverUrl = (isbn13) =>
  `https://products-images.di-static.com/image/x/${isbn13}-475x500-1.jpg`
export const abebooksCoverUrl = (isbn13) =>
  `https://pictures.abebooks.com/isbn/${isbn13}-fr-300.jpg`

/** Première couverture trouvée chez les libraires (Decitre, puis AbeBooks), ou undefined. */
export async function findRetailerCover(isbn13, { fetchFn = fetch } = {}) {
  for (const url of [decitreCoverUrl(isbn13), abebooksCoverUrl(isbn13)]) {
    // Ils répondent par une erreur (403, 404) quand ils n'ont pas l'image
    if (await bnfCoverExists(url, { fetchFn })) return url
  }
  return undefined
}
