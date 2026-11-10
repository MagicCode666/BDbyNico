import { amazonCoverUrl, imageExists } from '../collection/lookup/amazon'
import { findBnfCover } from '../collection/lookup/bnf'
import { findRetailerCover } from '../collection/lookup/retailers'

/**
 * Cherche la couverture d'un ISBN-13 : Amazon, la BnF, deux libraires (Decitre, AbeBooks), puis
 * Open Library en dernier recours. Open Library fournit parfois la page de titre du livre (presque blanche) au lieu de la couverture, alors
 * qu'Amazon a presque toujours la bonne pour la BD française.
 * Les adresses renvoyées sont exactement celles que la base accepte (voir `set_edition_cover`).
 * Pour économiser la bande passante (jusqu'à plusieurs centaines d'albums après un import),
 * l'existence est vérifiée sur une petite version de l'image (quelques Ko).
 */
export async function findCover(isbn: string): Promise<string | undefined> {
  const amazon = amazonCoverUrl(isbn)
  if (amazon && (await imageExists(amazon.replace('LZZZZZZZ', 'MZZZZZZZ')))) return amazon
  const bnf = await findBnfCover(isbn)
  if (bnf) return bnf
  const retailer = await findRetailerCover(isbn)
  if (retailer) return retailer
  // « default=false » : Open Library répond 404 (et non une image vide) quand il n'a rien
  const smallOpenLibrary = `https://covers.openlibrary.org/b/isbn/${isbn}-S.jpg?default=false`
  if (await imageExists(smallOpenLibrary)) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
  }
  return undefined
}

// Un album sans couverture introuvable n'est pas recherché à chaque visite : on réessaie plus tard.
const RETRY_AFTER_MS = 14 * 24 * 60 * 60 * 1000
// Version 2 : les nouvelles sources (libraires) justifient de réessayer les albums sans couverture
const storageKey = (isbn: string) => `bdbynico:cover-tried-v2:${isbn}`

export function wasRecentlyTried(isbn: string, now = Date.now()): boolean {
  try {
    const value = Number(localStorage.getItem(storageKey(isbn)))
    return value > 0 && now - value < RETRY_AFTER_MS
  } catch {
    return false
  }
}

export function markTried(isbn: string, now = Date.now()): void {
  try {
    localStorage.setItem(storageKey(isbn), String(now))
  } catch {
    // stockage indisponible : on réessaiera simplement à la prochaine visite
  }
}
