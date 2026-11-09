export type LookupSource = 'catalogue' | 'bnf' | 'openlibrary' | 'bnf+openlibrary'

/** Informations d'un album trouvées par une recherche (tous les champs sont optionnels). */
export interface BookInfo {
  title?: string
  seriesName?: string
  volume?: number
  authors: string[]
  publisher?: string
  /** Date ISO (AAAA-MM-JJ). Quand seule l'année est connue : AAAA-01-01. */
  publishedOn?: string
  coverUrl?: string
}

export interface LookupResult {
  info: BookInfo
  source: LookupSource
}
