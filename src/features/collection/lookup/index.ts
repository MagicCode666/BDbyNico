import { getCatalogueEdition } from '../api'
import { findAmazonCover } from './amazon'
import { lookupBnf } from './bnf'
import { mergeBookInfo } from './merge'
import { lookupOpenLibrary } from './openLibrary'
import type { LookupResult } from './types'

/**
 * Cherche les informations d'un ISBN-13 : d'abord le catalogue partagé (déjà saisi par un
 * utilisateur), sinon la BnF et Open Library en parallèle. Quand aucune couverture n'est
 * trouvée, on tente en dernier recours celle d'Amazon.
 * Renvoie null si rien n'est trouvé ; lève une erreur si aucune source n'a pu être jointe.
 */
export async function findAlbumInfo(isbn: string): Promise<LookupResult | null> {
  const existing = await getCatalogueEdition(isbn)
  if (existing) {
    return {
      source: 'catalogue',
      info: {
        title: existing.title,
        seriesName: existing.series?.name,
        volume: existing.volume ?? undefined,
        authors: existing.authors,
        publisher: existing.publisher ?? undefined,
        publishedOn: existing.publishedOn ?? undefined,
        coverUrl: existing.coverUrl ?? (await findAmazonCover(isbn)),
      },
    }
  }

  // Lancée en même temps que les autres recherches ; ne rejette jamais
  const amazonCover = findAmazonCover(isbn)
  const [bnf, openLibrary] = await Promise.allSettled([lookupBnf(isbn), lookupOpenLibrary(isbn)])
  if (bnf.status === 'rejected' && openLibrary.status === 'rejected') throw bnf.reason
  const result = mergeBookInfo(
    bnf.status === 'fulfilled' ? bnf.value : null,
    openLibrary.status === 'fulfilled' ? openLibrary.value : null,
  )
  if (result && !result.info.coverUrl) result.info.coverUrl = await amazonCover
  return result
}

export type { BookInfo, LookupResult, LookupSource } from './types'
