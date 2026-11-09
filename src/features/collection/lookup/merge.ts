import type { BookInfo, LookupResult } from './types'

/**
 * Fusionne la BnF (référence pour les textes) et Open Library (couvertures, repli).
 * Pour chaque champ, la BnF l'emporte quand elle le fournit.
 */
export function mergeBookInfo(
  bnf: BookInfo | null,
  openLibrary: BookInfo | null,
): LookupResult | null {
  if (bnf && openLibrary) {
    return {
      source: 'bnf+openlibrary',
      info: {
        title: bnf.title ?? openLibrary.title,
        seriesName: bnf.seriesName ?? openLibrary.seriesName,
        // Le tome d'Open Library n'est repris que s'il se rapporte à la même série
        volume: bnf.volume ?? (bnf.seriesName ? undefined : openLibrary.volume),
        authors: bnf.authors.length > 0 ? bnf.authors : openLibrary.authors,
        publisher: bnf.publisher ?? openLibrary.publisher,
        publishedOn: bnf.publishedOn ?? openLibrary.publishedOn,
        coverUrl: openLibrary.coverUrl,
      },
    }
  }
  if (bnf) return { source: 'bnf', info: bnf }
  if (openLibrary) return { source: 'openlibrary', info: openLibrary }
  return null
}
