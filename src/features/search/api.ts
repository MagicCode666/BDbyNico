import { supabase } from '../../lib/supabase'

export type SearchKind = 'serie' | 'album' | 'auteur'

export interface SearchHit {
  kind: SearchKind
  /** Identifiant : id de série, ISBN d'album ou nom d'auteur. */
  ref: string
  label: string
  detail: string
  coverUrl: string | null
  seriesId: string | null
  isbn: string | null
  /** Statut de l'album dans MA collection (null : pas dedans). */
  myStatus: 'owned' | 'wanted' | null
}

export interface SearchResults {
  series: SearchHit[]
  albums: SearchHit[]
  authors: SearchHit[]
}

export const MIN_QUERY_LENGTH = 2

export const EMPTY_RESULTS: SearchResults = { series: [], albums: [], authors: [] }

export function groupHits(hits: SearchHit[]): SearchResults {
  return {
    series: hits.filter((hit) => hit.kind === 'serie'),
    albums: hits.filter((hit) => hit.kind === 'album'),
    authors: hits.filter((hit) => hit.kind === 'auteur'),
  }
}

/** Cherche dans le catalogue partagé : séries, albums et auteurs (8 de chaque au plus). */
export async function searchCatalogue(query: string, limit = 8): Promise<SearchResults> {
  if (query.trim().length < MIN_QUERY_LENGTH) return EMPTY_RESULTS
  const { data, error } = await supabase.rpc('search_catalogue', {
    p_query: query,
    p_limit: limit,
  })
  if (error) throw error
  return groupHits(
    data.map((row) => ({
      kind: row.kind as SearchKind,
      ref: row.ref,
      label: row.label,
      detail: row.detail,
      coverUrl: row.cover_url,
      seriesId: row.series_id,
      isbn: row.isbn,
      myStatus: row.my_status === 'owned' || row.my_status === 'wanted' ? row.my_status : null,
    })),
  )
}
