import { findAmazonCover, imageExists } from '../collection/lookup/amazon'

/**
 * Cherche la couverture d'un ISBN-13 : Open Library d'abord, Amazon en repli.
 * Les adresses renvoyées sont exactement celles que la base accepte (voir `set_edition_cover`).
 */
export async function findCover(isbn: string): Promise<string | undefined> {
  const openLibrary = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`
  // « default=false » : Open Library répond 404 (et non une image vide) quand il n'a rien
  if (await imageExists(`${openLibrary}?default=false`)) return openLibrary
  return findAmazonCover(isbn)
}

// Un album sans couverture introuvable n'est pas recherché à chaque visite : on réessaie plus tard.
const RETRY_AFTER_MS = 14 * 24 * 60 * 60 * 1000
const storageKey = (isbn: string) => `bdbynico:cover-tried:${isbn}`

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
