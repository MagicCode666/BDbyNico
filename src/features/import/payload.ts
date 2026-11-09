import type { ImportRow } from './types'

/**
 * Ligne envoyée à la fonction serveur `import_editions` (catalogue partagé).
 * Séparée de `bubble.ts` pour que la bibliothèque d'analyse des CSV reste chargée à la demande.
 */
export function toEditionPayload(row: ImportRow) {
  return {
    isbn: row.isbn,
    title: row.title,
    series: row.seriesName,
    volume: row.volume,
    authors: row.authors,
    publisher: row.publisher,
    published_on: row.publishedOn,
  }
}
